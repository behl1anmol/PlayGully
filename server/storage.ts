import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";
import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";

// Use raw postgres connection for better compatibility
const client = postgres(process.env.DATABASE_URL || "", {
  ssl: process.env.NODE_ENV === "production" ? "require" : false,
});

const db = drizzle(client, { schema });
const INSTANT_LOCK_DURATION_SECONDS = 180;

type StatusRuleForExactRequirement = {
  validatePlayerStatusId: number;
  description: string;
  maxPerTeam: number | null;
};

type ExactStatusRequirement = {
  validatePlayerStatusId: number;
  description: string;
  exactPerTeam: number;
};

function normalizeStatusName(statusDescription: string) {
  return statusDescription.trim().toLowerCase();
}

function toExpiryDate() {
  return new Date(Date.now() + INSTANT_LOCK_DURATION_SECONDS * 1000);
}

function findStatusRuleByNames(statusRules: StatusRuleForExactRequirement[], names: string[]) {
  const targetNames = new Set(names.map((name) => normalizeStatusName(name)));
  return statusRules.find((statusRule) => targetNames.has(normalizeStatusName(statusRule.description))) ?? null;
}

function getExactDiamondGoldRequirements(statusRules: StatusRuleForExactRequirement[]) {
  const diamondRule = findStatusRuleByNames(statusRules, ["diamond", "diamin"]);
  const goldRule = findStatusRuleByNames(statusRules, ["gold"]);

  if (!diamondRule || !goldRule) {
    throw new Error("VALIDATION:Diamond and Gold status rules must be configured");
  }

  if (diamondRule.maxPerTeam === null || goldRule.maxPerTeam === null) {
    throw new Error("VALIDATION:Diamond and Gold limits must be configured as exact per-team values");
  }

  return [
    {
      validatePlayerStatusId: diamondRule.validatePlayerStatusId,
      description: diamondRule.description,
      exactPerTeam: diamondRule.maxPerTeam,
    },
    {
      validatePlayerStatusId: goldRule.validatePlayerStatusId,
      description: goldRule.description,
      exactPerTeam: goldRule.maxPerTeam,
    },
  ] as ExactStatusRequirement[];
}

function countTeamStatusPlayers(players: Array<{ soldTo: number | null; validatePlayerStatusId: number | null }>, teamId: number, statusId: number) {
  return players.filter(
    (player) =>
      player.soldTo === teamId &&
      Number(player.validatePlayerStatusId) === statusId,
  ).length;
}

function validateTeamExactStatusFeasibility(
  team: { id: number; name: string },
  players: Array<{ soldTo: number | null; validatePlayerStatusId: number | null }>,
  exactRequirements: ExactStatusRequirement[],
  maxPlayersPerTeam: number,
) {
  const teamPlayersCount = players.filter((player) => player.soldTo === team.id).length;
  const remainingSlots = maxPlayersPerTeam - teamPlayersCount;

  if (remainingSlots < 0) {
    return `Rule violation: Team ${team.name} exceeds maximum allowed players (${maxPlayersPerTeam})`;
  }

  let missingRequiredPlayers = 0;

  for (const requirement of exactRequirements) {
    const statusCount = countTeamStatusPlayers(players, team.id, requirement.validatePlayerStatusId);
    if (statusCount > requirement.exactPerTeam) {
      return `Rule violation: Team ${team.name} cannot have more than ${requirement.exactPerTeam} ${requirement.description} players`;
    }

    missingRequiredPlayers += Math.max(0, requirement.exactPerTeam - statusCount);
  }

  if (missingRequiredPlayers > remainingSlots) {
    return `Rule violation: Team ${team.name} must finish with exact Diamond and Gold counts. Current booking leaves too few slots to satisfy the rule.`;
  }

  return null;
}

export const storage = {
  // Initialize
  async initialize() {
    try {
      const defaultPlayerStatuses = [
        { validatePlayerStatusId: 1, description: "Diamond" },
        { validatePlayerStatusId: 2, description: "Gold" },
        { validatePlayerStatusId: 3, description: "Silver" },
        { validatePlayerStatusId: 4, description: "Bronze" },
        { validatePlayerStatusId: 5, description: "Elite" },
      ];

      const existingStatuses = await db.select().from(schema.ValidatePlayerStatus);
      const existingStatusById = new Map(
        existingStatuses.map((status) => [status.validatePlayerStatusId, status]),
      );

      for (const status of defaultPlayerStatuses) {
        const existingStatus = existingStatusById.get(status.validatePlayerStatusId);
        if (!existingStatus) {
          await db.insert(schema.ValidatePlayerStatus).values(status);
          continue;
        }

        if (existingStatus.description !== status.description) {
          await db
            .update(schema.ValidatePlayerStatus)
            .set({ description: status.description })
            .where(eq(schema.ValidatePlayerStatus.validatePlayerStatusId, status.validatePlayerStatusId));
        }
      }

      const defaultStatusRuleByStatusId: Record<number, { basePrice: number; maxPerTeam: number | null }> = {
        1: { basePrice: 100, maxPerTeam: 1 },
        2: { basePrice: 70, maxPerTeam: 2 },
        3: { basePrice: 0, maxPerTeam: null },
        4: { basePrice: 0, maxPerTeam: null },
        5: { basePrice: 0, maxPerTeam: 1 },
      };

      const existingStatusRules = await db.select().from(schema.playerStatusRules);
      const existingStatusRuleByStatusId = new Map(
        existingStatusRules.map((statusRule) => [statusRule.validatePlayerStatusId, statusRule]),
      );

      for (const status of defaultPlayerStatuses) {
        const defaultRule = defaultStatusRuleByStatusId[status.validatePlayerStatusId];
        if (!defaultRule) continue;

        const existingRule = existingStatusRuleByStatusId.get(status.validatePlayerStatusId);
        if (!existingRule) {
          await db.insert(schema.playerStatusRules).values({
            validatePlayerStatusId: status.validatePlayerStatusId,
            basePrice: defaultRule.basePrice,
            maxPerTeam: defaultRule.maxPerTeam,
          });
          continue;
        }

        if (
          (status.validatePlayerStatusId === 3 || status.validatePlayerStatusId === 4) &&
          existingRule.basePrice !== 0
        ) {
          await db
            .update(schema.playerStatusRules)
            .set({ basePrice: 0 })
            .where(eq(schema.playerStatusRules.validatePlayerStatusId, status.validatePlayerStatusId));
        }
      }

      const setup = await db.select().from(schema.setup).limit(1);
      if (!setup.length) {
        // Create default setup record
        await db.insert(schema.setup).values({
          teamCount: 2,
          budgetPerTeam: 500,
          maxPlayersPerTeam: 11,
          password: "appl2026",
        });
        console.log("Initialized setup with default password: appl2026");
      }

      await this.backfillCaptainsEliteStatus();
    } catch (error) {
      console.error("Failed to initialize setup:", error);
    }
  },

  async getPlayerStatuses() {
    return await db
      .select()
      .from(schema.ValidatePlayerStatus)
      .orderBy(schema.ValidatePlayerStatus.validatePlayerStatusId);
  },

  async getPlayerStatusRules() {
    const [playerStatuses, statusRules] = await Promise.all([
      this.getPlayerStatuses(),
      db.select().from(schema.playerStatusRules),
    ]);

    const statusRuleByStatusId = new Map(
      statusRules.map((statusRule) => [statusRule.validatePlayerStatusId, statusRule]),
    );

    return playerStatuses.map((playerStatus) => {
      const statusRule = statusRuleByStatusId.get(playerStatus.validatePlayerStatusId);
      return {
        ...playerStatus,
        basePrice: statusRule?.basePrice ?? 0,
        maxPerTeam: statusRule?.maxPerTeam ?? null,
      };
    });
  },

  async updatePlayerStatusRules(
    updates: Array<{
      validatePlayerStatusId: number;
      basePrice?: number;
      maxPerTeam?: number | null;
    }>,
  ) {
    if (updates.length === 0) {
      return this.getPlayerStatusRules();
    }

    const existingRules = await db.select().from(schema.playerStatusRules);
    const existingRuleByStatusId = new Map(
      existingRules.map((statusRule) => [statusRule.validatePlayerStatusId, statusRule]),
    );

    for (const update of updates) {
      const setData: { basePrice?: number; maxPerTeam?: number | null } = {};
      if (update.basePrice !== undefined) setData.basePrice = update.basePrice;
      if (update.maxPerTeam !== undefined) setData.maxPerTeam = update.maxPerTeam;

      const existingRule = existingRuleByStatusId.get(update.validatePlayerStatusId);
      if (!existingRule) {
        await db.insert(schema.playerStatusRules).values({
          validatePlayerStatusId: update.validatePlayerStatusId,
          basePrice: setData.basePrice ?? 0,
          maxPerTeam: setData.maxPerTeam ?? null,
        });
        continue;
      }

      if (Object.keys(setData).length > 0) {
        await db
          .update(schema.playerStatusRules)
          .set(setData)
          .where(eq(schema.playerStatusRules.validatePlayerStatusId, update.validatePlayerStatusId));

        if (setData.basePrice !== undefined) {
          await db
            .update(schema.players)
            .set({ basePrice: setData.basePrice })
            .where(
              and(
                eq(schema.players.validatePlayerStatusId, update.validatePlayerStatusId),
                isNull(schema.players.soldTo),
              ),
            );
        }
      }
    }

    return this.getPlayerStatusRules();
  },

  async assignCaptainEliteStatus(captainUsername: string) {
    const normalizedCaptainUsername = captainUsername?.trim().toLowerCase();
    if (!normalizedCaptainUsername) return;

    const [playerStatuses, statusRules] = await Promise.all([
      this.getPlayerStatuses(),
      this.getPlayerStatusRules(),
    ]);

    const eliteStatus = playerStatuses.find(
      (playerStatus) => normalizeStatusName(playerStatus.description) === "elite",
    );
    if (!eliteStatus) return;

    const eliteStatusRule = statusRules.find(
      (statusRule) => statusRule.validatePlayerStatusId === eliteStatus.validatePlayerStatusId,
    );
    const eliteBasePrice = eliteStatusRule?.basePrice ?? 0;

    const players = await db.select().from(schema.players);
    const captainPlayers = players.filter(
      (player) => player.name.toLowerCase() === normalizedCaptainUsername,
    );

    for (const captainPlayer of captainPlayers) {
      if (
        captainPlayer.validatePlayerStatusId !== eliteStatus.validatePlayerStatusId ||
        captainPlayer.basePrice !== eliteBasePrice
      ) {
        await db.update(schema.players)
          .set({
            validatePlayerStatusId: eliteStatus.validatePlayerStatusId,
            basePrice: eliteBasePrice,
          })
          .where(eq(schema.players.id, captainPlayer.id));
      }
    }
  },

  async backfillCaptainsEliteStatus() {
    const teams = await this.getTeams();
    for (const team of teams) {
      await this.assignCaptainEliteStatus(team.ownerName);
    }
  },

  // Password validation
  async validatePassword(password: string): Promise<boolean> {
    const setup = await db.select().from(schema.setup).limit(1);
    if (!setup.length) return false;
    return setup[0].password === password;
  },

  // Setup
  async getSetup() {
    const result = await db.select().from(schema.setup).limit(1);
    return result[0] || null;
  },

  async saveSetup(data: {
    teamCount: number;
    budgetPerTeam: number;
    maxPlayersPerTeam?: number;
    password?: string;
  }) {
    const existing = await db.select().from(schema.setup).limit(1);
    if (existing.length > 0) {
      const updated = await db.update(schema.setup)
        .set({
          teamCount: data.teamCount,
          budgetPerTeam: data.budgetPerTeam,
          ...(data.maxPlayersPerTeam !== undefined ? { maxPlayersPerTeam: data.maxPlayersPerTeam } : {}),
          ...(data.password ? { password: data.password } : {}),
        })
        .where(eq(schema.setup.id, existing[0].id))
        .returning();
      return updated[0];
    }
    const inserted = await db.insert(schema.setup).values(data).returning();
    return inserted[0];
  },

  async updateMaxPlayersPerTeam(maxPlayersPerTeam: number) {
    const existing = await db.select().from(schema.setup).limit(1);
    if (existing.length > 0) {
      const updated = await db
        .update(schema.setup)
        .set({ maxPlayersPerTeam })
        .where(eq(schema.setup.id, existing[0].id))
        .returning();
      return updated[0];
    }

    const inserted = await db.insert(schema.setup).values({
      teamCount: 2,
      budgetPerTeam: 500,
      maxPlayersPerTeam,
      password: "appl2026",
    }).returning();
    return inserted[0];
  },

  // Players
  async getPlayers() {
    return await db.select().from(schema.players).orderBy(schema.players.id);
  },

  async createPlayer(data: typeof schema.players.$inferInsert) {
    const inserted = await db.insert(schema.players).values(data).returning();
    return inserted[0];
  },

  async updatePlayer(id: number, updates: Partial<typeof schema.players.$inferInsert>) {
    const updated = await db.update(schema.players)
      .set(updates)
      .where(eq(schema.players.id, id))
      .returning();
    return updated[0] || null;
  },

  async deletePlayer(id: number) {
    await db.delete(schema.players).where(eq(schema.players.id, id));
  },

  // Teams
  async getTeams() {
    return await db.select().from(schema.teams).orderBy(schema.teams.id);
  },

  async getTeamByUsername(username: string, _password: string) {
    const teams = await db.select().from(schema.teams);
    return teams.find((team) => team.ownerName.toLowerCase() === username.toLowerCase()) ?? null;
  },

  async createTeam(data: typeof schema.teams.$inferInsert) {
    const inserted = await db.insert(schema.teams).values(data).returning();
    return inserted[0];
  },

  async updateTeam(id: number, updates: Partial<typeof schema.teams.$inferInsert>) {
    const updated = await db.update(schema.teams)
      .set(updates)
      .where(eq(schema.teams.id, id))
      .returning();
    return updated[0] || null;
  },

  async deleteTeam(id: number) {
    await db.update(schema.players)
      .set({ soldTo: null, soldAmount: null, status: "available" })
      .where(eq(schema.players.soldTo, id));

    await db.delete(schema.teams).where(eq(schema.teams.id, id));
  },

  // Auction
  async getAuctionState() {
    const state = await db.select().from(schema.auctionState).limit(1);
    return state[0] || null;
  },

  async getInstantAuctionState() {
    const state = await db.select().from(schema.instantAuctionState).limit(1);
    return state[0] || null;
  },

  async cleanupExpiredInstantLocks() {
    await db
      .delete(schema.instantPlayerLocks)
      .where(lte(schema.instantPlayerLocks.expiresAt, new Date()));
  },

  async getInstantLocks() {
    await this.cleanupExpiredInstantLocks();
    return await db.select().from(schema.instantPlayerLocks);
  },

  async startAuction() {
    const players = await db.select().from(schema.players).orderBy(schema.players.id);
    const playerIds = players.map(p => p.id);
    
    const existing = await db.select().from(schema.auctionState).limit(1);
    if (existing.length > 0) {
      const updated = await db.update(schema.auctionState)
        .set({ 
          status: 'active',
          currentPlayerIndex: 0,
          currentPlayerId: playerIds[0] || null,
          playerQueue: playerIds,
          currentBid: null,
          currentBidTeamId: null
        })
        .where(eq(schema.auctionState.id, existing[0].id))
        .returning();
      return updated[0];
    }
    
    const inserted = await db.insert(schema.auctionState).values({
      status: 'active',
      currentPlayerIndex: 0,
      currentPlayerId: playerIds[0] || null,
      playerQueue: playerIds,
      currentBid: null,
      currentBidTeamId: null
    }).returning();
    return inserted[0];
  },

  async startInstantAuction() {
    await this.cleanupExpiredInstantLocks();

    const existing = await db.select().from(schema.instantAuctionState).limit(1);
    if (existing.length > 0) {
      const updated = await db
        .update(schema.instantAuctionState)
        .set({ status: "active", startedAt: new Date() })
        .where(eq(schema.instantAuctionState.id, existing[0].id))
        .returning();
      return updated[0];
    }

    const inserted = await db
      .insert(schema.instantAuctionState)
      .values({ status: "active" })
      .returning();
    return inserted[0];
  },

  async stopInstantAuction() {
    await db.update(schema.instantAuctionState).set({ status: "idle" });
    await db.delete(schema.instantPlayerLocks);
  },

  async lockInstantPlayers(teamId: number, playerIds: number[]) {
    const uniquePlayerIds = [...new Set(playerIds.map((playerId) => Number(playerId)).filter(Number.isInteger))];
    if (uniquePlayerIds.length === 0) {
      throw new Error("VALIDATION:At least one player must be selected");
    }

    const expiryDate = toExpiryDate();

    return await db.transaction(async (tx) => {
      await tx
        .delete(schema.instantPlayerLocks)
        .where(
          and(
            inArray(schema.instantPlayerLocks.playerId, uniquePlayerIds),
            lte(schema.instantPlayerLocks.expiresAt, new Date()),
          ),
        );

      const players = await tx
        .select()
        .from(schema.players)
        .where(inArray(schema.players.id, uniquePlayerIds));

      if (players.length !== uniquePlayerIds.length) {
        throw new Error("VALIDATION:One or more selected players do not exist");
      }

      const unavailablePlayers = players.filter((player) => player.soldTo !== null);
      if (unavailablePlayers.length > 0) {
        throw new Error("CONFLICT:One or more selected players are already booked");
      }

      const activeLocks = await tx
        .select()
        .from(schema.instantPlayerLocks)
        .where(
          and(
            inArray(schema.instantPlayerLocks.playerId, uniquePlayerIds),
            gt(schema.instantPlayerLocks.expiresAt, new Date()),
          ),
        );

      const conflictingLocks = activeLocks.filter((lock) => lock.teamId !== teamId);
      if (conflictingLocks.length > 0) {
        throw new Error("CONFLICT:One or more selected players are locked by another captain");
      }

      const activeLockByPlayerId = new Map(activeLocks.map((lock) => [lock.playerId, lock]));
      const playerIdsToInsert = uniquePlayerIds.filter((playerId) => !activeLockByPlayerId.has(playerId));
      const playerIdsToRefresh = uniquePlayerIds.filter((playerId) => activeLockByPlayerId.has(playerId));

      if (playerIdsToRefresh.length > 0) {
        await tx
          .update(schema.instantPlayerLocks)
          .set({ expiresAt: expiryDate })
          .where(
            and(
              inArray(schema.instantPlayerLocks.playerId, playerIdsToRefresh),
              eq(schema.instantPlayerLocks.teamId, teamId),
            ),
          );
      }

      if (playerIdsToInsert.length > 0) {
        try {
          await tx.insert(schema.instantPlayerLocks).values(
            playerIdsToInsert.map((playerId) => ({
              playerId,
              teamId,
              expiresAt: expiryDate,
            })),
          );
        } catch {
          throw new Error("CONFLICT:One or more selected players were just locked by another captain");
        }
      }

      return await tx
        .select()
        .from(schema.instantPlayerLocks)
        .where(
          and(
            inArray(schema.instantPlayerLocks.playerId, uniquePlayerIds),
            eq(schema.instantPlayerLocks.teamId, teamId),
          ),
        );
    });
  },

  async releaseInstantLocks(teamId: number, playerIds: number[]) {
    const uniquePlayerIds = [...new Set(playerIds.map((playerId) => Number(playerId)).filter(Number.isInteger))];
    if (uniquePlayerIds.length === 0) {
      return;
    }

    await db.delete(schema.instantPlayerLocks).where(
      and(
        inArray(schema.instantPlayerLocks.playerId, uniquePlayerIds),
        eq(schema.instantPlayerLocks.teamId, teamId),
      ),
    );
  },

  async bookInstantPlayers(teamId: number, playerIds: number[]) {
    const uniquePlayerIds = [...new Set(playerIds.map((playerId) => Number(playerId)).filter(Number.isInteger))];
    if (uniquePlayerIds.length === 0) {
      throw new Error("VALIDATION:At least one player must be selected");
    }

    return await db.transaction(async (tx) => {
      await tx
        .delete(schema.instantPlayerLocks)
        .where(
          and(
            inArray(schema.instantPlayerLocks.playerId, uniquePlayerIds),
            lte(schema.instantPlayerLocks.expiresAt, new Date()),
          ),
        );

      const locks = await tx
        .select()
        .from(schema.instantPlayerLocks)
        .where(
          and(
            inArray(schema.instantPlayerLocks.playerId, uniquePlayerIds),
            eq(schema.instantPlayerLocks.teamId, teamId),
            gt(schema.instantPlayerLocks.expiresAt, new Date()),
          ),
        );

      if (locks.length !== uniquePlayerIds.length) {
        throw new Error("CONFLICT:All selected players must be locked by you before booking");
      }

      const [setupConfig, allTeams, allPlayers, statusRules] = await Promise.all([
        tx.select().from(schema.setup).limit(1),
        tx.select().from(schema.teams),
        tx.select().from(schema.players),
        this.getPlayerStatusRules(),
      ]);

      const selectedPlayers = allPlayers.filter((player) => uniquePlayerIds.includes(player.id));
      if (selectedPlayers.length !== uniquePlayerIds.length) {
        throw new Error("VALIDATION:One or more selected players do not exist");
      }

      const alreadyBooked = selectedPlayers.find((player) => player.soldTo !== null);
      if (alreadyBooked) {
        throw new Error("CONFLICT:One or more selected players are already booked");
      }

      const selectedTeam = allTeams.find((team) => team.id === teamId);
      if (!selectedTeam) {
        throw new Error("VALIDATION:Team not found");
      }

      const maxPlayersPerTeam = setupConfig[0]?.maxPlayersPerTeam ?? 11;
      const soldPlayersForTeam = allPlayers.filter((player) => player.soldTo === teamId);
      if (soldPlayersForTeam.length + selectedPlayers.length > maxPlayersPerTeam) {
        throw new Error(`CONFLICT:Rule violation: Team can have maximum ${maxPlayersPerTeam} players`);
      }

      const statusRuleByStatusId = new Map(
        statusRules.map((statusRule) => [statusRule.validatePlayerStatusId, statusRule]),
      );

      const exactRequirements = getExactDiamondGoldRequirements(statusRules);

      const projectedPlayers = allPlayers.map((player) => {
        if (!uniquePlayerIds.includes(player.id)) {
          return player;
        }

        return {
          ...player,
          soldTo: teamId,
        };
      });

      const exactFeasibilityError = validateTeamExactStatusFeasibility(
        selectedTeam,
        projectedPlayers,
        exactRequirements,
        maxPlayersPerTeam,
      );
      if (exactFeasibilityError) {
        throw new Error(`CONFLICT:${exactFeasibilityError}`);
      }

      const currentStatusCountByStatusId = new Map<number, number>();
      for (const player of soldPlayersForTeam) {
        if (!Number.isInteger(player.validatePlayerStatusId ?? null)) continue;
        const statusId = Number(player.validatePlayerStatusId);
        currentStatusCountByStatusId.set(statusId, (currentStatusCountByStatusId.get(statusId) ?? 0) + 1);
      }

      const eliteStatusRule = statusRules.find(
        (statusRule) => normalizeStatusName(statusRule.description) === "elite",
      );
      if (eliteStatusRule) {
        const captainAlreadyCounted = soldPlayersForTeam.some(
          (player) =>
            player.validatePlayerStatusId === eliteStatusRule.validatePlayerStatusId &&
            player.name.toLowerCase() === selectedTeam.ownerName.toLowerCase(),
        );
        if (!captainAlreadyCounted) {
          currentStatusCountByStatusId.set(
            eliteStatusRule.validatePlayerStatusId,
            (currentStatusCountByStatusId.get(eliteStatusRule.validatePlayerStatusId) ?? 0) + 1,
          );
        }
      }

      const selectedStatusCountByStatusId = new Map<number, number>();
      for (const player of selectedPlayers) {
        if (!Number.isInteger(player.validatePlayerStatusId ?? null)) continue;
        const statusId = Number(player.validatePlayerStatusId);
        selectedStatusCountByStatusId.set(statusId, (selectedStatusCountByStatusId.get(statusId) ?? 0) + 1);
      }

      for (const [statusId, selectedCount] of selectedStatusCountByStatusId.entries()) {
        const statusRule = statusRuleByStatusId.get(statusId);
        if (!statusRule || statusRule.maxPerTeam === null) continue;

        const currentCount = currentStatusCountByStatusId.get(statusId) ?? 0;
        if (currentCount + selectedCount > statusRule.maxPerTeam) {
          throw new Error(
            `CONFLICT:Rule violation: Team already has maximum allowed ${statusRule.description} players (${statusRule.maxPerTeam})`,
          );
        }
      }

      const totalPrice = selectedPlayers.reduce((sum, player) => sum + (player.basePrice ?? 0), 0);
      if (selectedTeam.remainingBudget < totalPrice) {
        throw new Error("CONFLICT:Insufficient budget to complete booking");
      }

      for (const player of selectedPlayers) {
        const updatedPlayers = await tx
          .update(schema.players)
          .set({
            soldTo: teamId,
            soldAmount: player.basePrice,
            status: "sold",
          })
          .where(
            and(
              eq(schema.players.id, player.id),
              isNull(schema.players.soldTo),
            ),
          )
          .returning();

        if (updatedPlayers.length === 0) {
          throw new Error("CONFLICT:A selected player became unavailable during booking");
        }
      }

      await tx
        .update(schema.teams)
        .set({ remainingBudget: selectedTeam.remainingBudget - totalPrice })
        .where(eq(schema.teams.id, teamId));

      await tx
        .delete(schema.instantPlayerLocks)
        .where(inArray(schema.instantPlayerLocks.playerId, uniquePlayerIds));

      return {
        bookedPlayerIds: uniquePlayerIds,
        totalPrice,
      };
    });
  },

  async releaseInstantBookedPlayers(
    playerIds: number[],
    actor: { role: "admin" | "captain"; teamId?: number },
  ) {
    const uniquePlayerIds = [...new Set(playerIds.map((playerId) => Number(playerId)).filter(Number.isInteger))];
    if (uniquePlayerIds.length === 0) {
      throw new Error("VALIDATION:At least one player must be selected");
    }

    return await db.transaction(async (tx) => {
      const players = await tx
        .select()
        .from(schema.players)
        .where(inArray(schema.players.id, uniquePlayerIds));

      if (players.length !== uniquePlayerIds.length) {
        throw new Error("VALIDATION:One or more selected players do not exist");
      }

      const unsoldPlayer = players.find((player) => player.soldTo === null);
      if (unsoldPlayer) {
        throw new Error("VALIDATION:Only booked players can be released");
      }

      if (actor.role === "captain") {
        if (!Number.isInteger(actor.teamId)) {
          throw new Error("UNAUTHORIZED:Captain team is missing");
        }

        const hasOtherTeamPlayer = players.some((player) => player.soldTo !== actor.teamId);
        if (hasOtherTeamPlayer) {
          throw new Error("UNAUTHORIZED:You can only release players booked by your team");
        }
      }

      const refundByTeamId = new Map<number, number>();
      for (const player of players) {
        const teamId = Number(player.soldTo);
        if (!Number.isInteger(teamId)) continue;
        refundByTeamId.set(teamId, (refundByTeamId.get(teamId) ?? 0) + (player.soldAmount ?? 0));
      }

      const teams = await tx.select().from(schema.teams).where(inArray(schema.teams.id, [...refundByTeamId.keys()]));
      for (const team of teams) {
        const refund = refundByTeamId.get(team.id) ?? 0;
        await tx
          .update(schema.teams)
          .set({ remainingBudget: team.remainingBudget + refund })
          .where(eq(schema.teams.id, team.id));
      }

      await tx
        .update(schema.players)
        .set({ soldTo: null, soldAmount: null, status: "available" })
        .where(inArray(schema.players.id, uniquePlayerIds));

      return {
        releasedPlayerIds: uniquePlayerIds,
      };
    });
  },

  async pauseAuction() {
    const state = await db.select().from(schema.auctionState).limit(1);
    if (!state.length) throw new Error('No auction state found');

    const current = state[0];
    if (current.status !== 'active') throw new Error('Auction is not active');

    const updated = await db.update(schema.auctionState)
      .set({ status: 'paused' })
      .where(eq(schema.auctionState.id, current.id))
      .returning();
    return updated[0];
  },

  async resumeAuction() {
    const state = await db.select().from(schema.auctionState).limit(1);
    if (!state.length) throw new Error('No auction state found');

    const current = state[0];
    if (current.status !== 'paused') throw new Error('Auction is not paused');

    const updated = await db.update(schema.auctionState)
      .set({ status: 'active' })
      .where(eq(schema.auctionState.id, current.id))
      .returning();
    return updated[0];
  },

  async nextPlayer() {
    const state = await db.select().from(schema.auctionState).limit(1);
    if (!state.length) throw new Error('No auction state found');
    
    const current = state[0];
    if (current.status !== 'active') throw new Error('Auction is not active');

    const nextIndex = current.currentPlayerIndex + 1;
    const nextPlayerId = current.playerQueue[nextIndex] || null;
    
    const updated = await db.update(schema.auctionState)
      .set({
        currentPlayerIndex: nextIndex,
        currentPlayerId: nextPlayerId,
        currentBid: null,
        currentBidTeamId: null,
        status: nextPlayerId ? 'active' : 'completed'
      })
      .where(eq(schema.auctionState.id, current.id))
      .returning();
    return updated[0];
  },

  async placeBid(teamId: number, amount: number) {
    const state = await db.select().from(schema.auctionState).limit(1);
    if (!state.length) throw new Error('No auction state');

    if (state[0].status !== 'active') throw new Error('Auction is not active');
    if (!state[0].currentPlayerId) throw new Error('No current player');
    
    const updated = await db.update(schema.auctionState)
      .set({ currentBid: amount, currentBidTeamId: teamId })
      .where(eq(schema.auctionState.id, state[0].id))
      .returning();
    return updated[0];
  },

  async sellPlayer() {
    const state = await db.select().from(schema.auctionState).limit(1);
    if (!state.length) throw new Error('No auction state');
    
    const current = state[0];
    if (current.status !== 'active') throw new Error('Auction is not active');

    if (!current.currentPlayerId || !current.currentBidTeamId || !current.currentBid) {
      throw new Error('No active bid to sell');
    }

    // Update player as sold
    await db.update(schema.players)
      .set({ 
        soldTo: current.currentBidTeamId,
        soldAmount: current.currentBid,
        status: 'sold'
      })
      .where(eq(schema.players.id, current.currentPlayerId));

    // Update team budget
    const team = await db.select().from(schema.teams).where(eq(schema.teams.id, current.currentBidTeamId)).limit(1);
    if (team.length > 0) {
      await db.update(schema.teams)
        .set({ remainingBudget: team[0].remainingBudget - current.currentBid })
        .where(eq(schema.teams.id, current.currentBidTeamId));
    }

    // Move to next player
    return await this.nextPlayer();
  },

  async markPlayerUnsold() {
    const state = await db.select().from(schema.auctionState).limit(1);
    if (!state.length) throw new Error('No auction state');
    
    const current = state[0];
    if (current.status !== 'active') throw new Error('Auction is not active');

    if (!current.currentPlayerId) throw new Error('No current player');

    await db.update(schema.players)
      .set({ status: 'unsold' })
      .where(eq(schema.players.id, current.currentPlayerId));

    return await this.nextPlayer();
  },

  async resetAuction() {
    await db.delete(schema.instantPlayerLocks);
    await db.update(schema.instantAuctionState).set({ status: "idle" });

    const [teams, players] = await Promise.all([
      db.select().from(schema.teams),
      db.select().from(schema.players),
    ]);

    for (const team of teams) {
      const totalSpentByTeam = players
        .filter((player) => player.soldTo === team.id)
        .reduce((total, player) => total + (player.soldAmount ?? 0), 0);

      await db
        .update(schema.teams)
        .set({ remainingBudget: team.remainingBudget + totalSpentByTeam })
        .where(eq(schema.teams.id, team.id));
    }

    await db.update(schema.players).set({ status: 'available', soldTo: null, soldAmount: null });
    await db.delete(schema.auctionState);
  },

  // Results
  async getResults() {
    const teams = await db.select().from(schema.teams);
    const players = await db.select().from(schema.players);
    
    return teams.map(team => ({
      ...team,
      players: players.filter(p => p.soldTo === team.id)
    }));
  }
};
