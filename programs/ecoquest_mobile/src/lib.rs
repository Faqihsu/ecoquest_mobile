use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;

declare_id!("4RoEXMwC3pvm1NYb8oXvcezJzsvxZmCwMgNUKZxCnju5");

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/// SPL Token program ID — hardcoded to avoid anchor-spl dependency
pub const SPL_TOKEN_PROGRAM_ID_BYTES: [u8; 32] = [
    6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172,
    28, 180, 133, 237, 95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
];

pub fn spl_token_program_id() -> Pubkey {
    Pubkey::new_from_array(SPL_TOKEN_PROGRAM_ID_BYTES)
}

/// Minimum stake amount in base units (100 SKR with 6 decimals)
const MIN_STAKE_AMOUNT: u64 = 100_000_000;

/// Seconds per year for reward calculations
const SECONDS_PER_YEAR: u128 = 365 * 24 * 3600;

/// APY basis: 10_000 = 100.00%
const APY_BASIS_POINTS: u128 = 10_000;

/// Maximum metadata URI length (fixed-size array)
const MAX_URI_LEN: usize = 200;

/// Maximum title length
const MAX_TITLE_LEN: usize = 64;

/// Maximum description length
const MAX_DESC_LEN: usize = 256;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Raw SPL Token Transfer (avoids anchor-spl dependency)
// ═══════════════════════════════════════════════════════════════════════════════

/// Build and invoke an SPL Token Transfer instruction.
///
/// # Security
/// - Caller MUST validate that `from`, `to`, and `authority` are correct
/// - `token_program` is validated by `address` constraint in account contexts
fn spl_token_transfer<'info>(
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: spl_token_program_id(),
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new(*from.key, false),
            anchor_lang::solana_program::instruction::AccountMeta::new(*to.key, false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                *authority.key,
                true,
            ),
        ],
        data: {
            let mut data = vec![3u8]; // Transfer discriminator
            data.extend_from_slice(&amount.to_le_bytes());
            data
        },
    };
    if signer_seeds.is_empty() {
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[from, to, authority, token_program],
        )?;
    } else {
        invoke_signed(&ix, &[from, to, authority, token_program], signer_seeds)?;
    }
    Ok(())
}

/// Deserialize an SPL Token Account from raw account data.
/// Returns (mint, owner, amount).
///
/// # Security
/// - Validates account data length is exactly 165 bytes (SPL Token Account)
/// - Validates account owner is SPL Token program
fn unpack_token_account(account: &AccountInfo) -> Result<(Pubkey, Pubkey, u64)> {
    require!(
        account.owner == &spl_token_program_id(),
        EcoQuestError::InvalidTokenAccountOwner
    );
    let data = account.try_borrow_data()?;
    require!(data.len() == 165, EcoQuestError::InvalidTokenAccountData);

    let mint = Pubkey::try_from(&data[0..32]).unwrap();
    let owner = Pubkey::try_from(&data[32..64]).unwrap();
    let amount = u64::from_le_bytes(data[64..72].try_into().unwrap());
    Ok((mint, owner, amount))
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRAM
// ═══════════════════════════════════════════════════════════════════════════════

#[program]
pub mod ecoquest_mobile {
    use super::*;

    // ─── Quest Program ────────────────────────────────────────────────────────

    /// Initialize the quest program singleton PDA.
    /// Only callable once (PDA init prevents re-init).
    pub fn initialize_quest_program(ctx: Context<InitializeQuestProgram>) -> Result<()> {
        let program = &mut ctx.accounts.quest_program;
        program.authority = ctx.accounts.authority.key();
        program.total_quests_completed = 0;
        program.bump = ctx.bumps.quest_program;
        Ok(())
    }

    /// Record a quest completion proof on-chain.
    ///
    /// # Security
    /// - PDA seeded by [quest_id, user] prevents duplicate proofs
    /// - `metadata_uri` is fixed-size array, no dynamic allocation
    /// - Canonical bump stored for future revalidation
    pub fn mint_nft_proof(
        ctx: Context<MintNftProof>,
        quest_id: u64,
        gps_hash: [u8; 32],
        metadata_uri: [u8; MAX_URI_LEN],
        metadata_uri_len: u8,
    ) -> Result<()> {
        require!(
            (metadata_uri_len as usize) <= MAX_URI_LEN,
            EcoQuestError::InvalidMetadataUri
        );

        let proof = &mut ctx.accounts.proof;
        proof.quest_id = quest_id;
        proof.user = ctx.accounts.user.key();
        proof.gps_hash = gps_hash;
        proof.metadata_uri = metadata_uri;
        proof.metadata_uri_len = metadata_uri_len;
        proof.timestamp = Clock::get()?.unix_timestamp;
        proof.bump = ctx.bumps.proof;

        let program = &mut ctx.accounts.quest_program;
        program.total_quests_completed = program
            .total_quests_completed
            .checked_add(1)
            .ok_or(EcoQuestError::Overflow)?;
        Ok(())
    }

    // ─── Staking ──────────────────────────────────────────────────────────────

    /// Initialize the stake pool. Stores mint + vault bump for PDA signing.
    ///
    /// # Security
    /// - `skr_mint` owner validated as SPL Token program
    /// - `token_program` address validated against known constant
    pub fn initialize_stake_pool(
        ctx: Context<InitializeStakePool>,
        apy_bps: u32,
    ) -> Result<()> {
        // Validate mint is actually an SPL token mint (owner = Token program)
        require!(
            ctx.accounts.skr_mint.owner == &spl_token_program_id(),
            EcoQuestError::InvalidMintOwner
        );

        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.skr_mint = ctx.accounts.skr_mint.key();
        pool.apy_bps = apy_bps;
        pool.total_staked = 0;
        pool.bump = ctx.bumps.pool;
        pool.vault_bump = ctx.bumps.vault;
        Ok(())
    }

    /// Initialize a staker account — separate from staking to avoid init_if_needed.
    ///
    /// # Security
    /// - Explicit init prevents re-initialization attack vector
    /// - PDA [b"staker", user] ensures one staker account per user
    pub fn initialize_staker(ctx: Context<InitializeStaker>) -> Result<()> {
        let staker = &mut ctx.accounts.staker;
        staker.user = ctx.accounts.user.key();
        staker.amount = 0;
        staker.pending_rewards = 0;
        staker.last_claim_at = Clock::get()?.unix_timestamp;
        staker.guardian_pool = Pubkey::default(); // None = default pubkey
        staker.is_delegated = false;
        staker.delegated_at = 0;
        staker.bump = ctx.bumps.staker;
        Ok(())
    }

    /// Stake SKR tokens into the vault.
    ///
    /// # Security
    /// - Token account owner validated (must belong to user)
    /// - Token account mint validated (must match pool's SKR mint)
    /// - Minimum stake enforced
    /// - Overflow-safe arithmetic
    /// - `has_one` constraint on staker.user
    pub fn stake_skr(ctx: Context<StakeSKR>, amount: u64) -> Result<()> {
        require!(amount >= MIN_STAKE_AMOUNT, EcoQuestError::BelowMinimumStake);

        // ── Validate user token account ──────────────────────────────────────
        let (mint, owner, _balance) =
            unpack_token_account(&ctx.accounts.user_token_account)?;
        require!(
            owner == ctx.accounts.user.key(),
            EcoQuestError::TokenAccountOwnerMismatch
        );
        require!(
            mint == ctx.accounts.pool.skr_mint,
            EcoQuestError::TokenAccountMintMismatch
        );

        // ── Validate vault token account ─────────────────────────────────────
        let (vault_mint, _vault_owner, _vault_balance) =
            unpack_token_account(&ctx.accounts.vault)?;
        require!(
            vault_mint == ctx.accounts.pool.skr_mint,
            EcoQuestError::TokenAccountMintMismatch
        );

        // ── Transfer user → vault (user is signer) ──────────────────────────
        spl_token_transfer(
            ctx.accounts.user_token_account.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.user.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            amount,
            &[], // No PDA seeds — user signs
        )?;

        // ── Update staker ────────────────────────────────────────────────────
        let staker = &mut ctx.accounts.staker;
        // Accumulate pending rewards before changing amount
        accrue_rewards(staker, ctx.accounts.pool.apy_bps)?;
        staker.amount = staker
            .amount
            .checked_add(amount)
            .ok_or(EcoQuestError::Overflow)?;

        // ── Update pool ──────────────────────────────────────────────────────
        let pool = &mut ctx.accounts.pool;
        pool.total_staked = pool
            .total_staked
            .checked_add(amount)
            .ok_or(EcoQuestError::Overflow)?;

        emit!(StakeEvent {
            user: ctx.accounts.user.key(),
            amount,
            total_staked: pool.total_staked,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Unstake SKR tokens — vault PDA signs transfer back to user.
    ///
    /// # Security
    /// - Same token account validations as stake
    /// - Staker amount checked before subtraction
    /// - Vault PDA signs with canonical bump
    pub fn unstake_skr(ctx: Context<UnstakeSKR>, amount: u64) -> Result<()> {
        require!(amount > 0, EcoQuestError::InvalidAmount);

        let staker = &mut ctx.accounts.staker;
        require!(
            staker.amount >= amount,
            EcoQuestError::InsufficientStakeAmount
        );

        // ── Validate user token account ──────────────────────────────────────
        let (mint, owner, _) = unpack_token_account(&ctx.accounts.user_token_account)?;
        require!(
            owner == ctx.accounts.user.key(),
            EcoQuestError::TokenAccountOwnerMismatch
        );
        require!(
            mint == ctx.accounts.pool.skr_mint,
            EcoQuestError::TokenAccountMintMismatch
        );

        // ── Accrue rewards before changing amount ────────────────────────────
        accrue_rewards(staker, ctx.accounts.pool.apy_bps)?;

        staker.amount = staker
            .amount
            .checked_sub(amount)
            .ok_or(EcoQuestError::Overflow)?;

        let pool = &mut ctx.accounts.pool;
        pool.total_staked = pool
            .total_staked
            .checked_sub(amount)
            .ok_or(EcoQuestError::Overflow)?;

        // ── Transfer vault → user (vault PDA signs) ──────────────────────────
        let pool_key = pool.key();
        let vault_bump = pool.vault_bump;
        let seeds: &[&[u8]] = &[b"stake_vault", pool_key.as_ref(), &[vault_bump]];
        spl_token_transfer(
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.user_token_account.to_account_info(),
            ctx.accounts.vault.to_account_info(), // Vault is its own authority
            ctx.accounts.token_program.to_account_info(),
            amount,
            &[seeds],
        )?;

        emit!(UnstakeEvent {
            user: ctx.accounts.user.key(),
            amount,
            remaining: staker.amount,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Claim accumulated staking rewards.
    ///
    /// # Security
    /// - Uses u128 intermediary to prevent overflow on large stakes
    /// - Rewards only accrue from `last_claim_at` (not staked_at)
    /// - Division happens AFTER multiplication to maximize precision
    pub fn claim_staking_rewards(ctx: Context<ClaimStakingRewards>) -> Result<()> {
        let staker = &mut ctx.accounts.staker;
        require!(staker.amount > 0, EcoQuestError::InsufficientStakeAmount);

        accrue_rewards(staker, ctx.accounts.pool.apy_bps)?;

        let rewards = staker.pending_rewards;
        require!(rewards > 0, EcoQuestError::NoRewardsToClaim);

        // Reset pending (actual token transfer to be handled by authority off-chain
        // or via a separate reward vault — keeping reward accounting on-chain only)
        staker.pending_rewards = 0;

        emit!(RewardClaimedEvent {
            user: ctx.accounts.user.key(),
            reward: rewards,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Delegate staked SKR to a guardian pool for bonus rewards.
    pub fn delegate_to_guardian(
        ctx: Context<DelegateToGuardian>,
        guardian_pool: Pubkey,
    ) -> Result<()> {
        let staker = &mut ctx.accounts.staker;
        require!(staker.amount > 0, EcoQuestError::InsufficientStakeAmount);
        require!(
            guardian_pool != Pubkey::default(),
            EcoQuestError::InvalidGuardianPool
        );

        staker.guardian_pool = guardian_pool;
        staker.is_delegated = true;
        staker.delegated_at = Clock::get()?.unix_timestamp;

        emit!(DelegateEvent {
            user: ctx.accounts.user.key(),
            guardian_pool,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Remove guardian delegation.
    pub fn undelegate_from_guardian(ctx: Context<DelegateToGuardian>) -> Result<()> {
        let staker = &mut ctx.accounts.staker;
        staker.guardian_pool = Pubkey::default();
        staker.is_delegated = false;
        staker.delegated_at = 0;
        Ok(())
    }

    /// Close staker account and reclaim rent SOL. Only if fully unstaked.
    pub fn close_staker(ctx: Context<CloseStaker>) -> Result<()> {
        let staker = &ctx.accounts.staker;
        require!(staker.amount == 0, EcoQuestError::CannotCloseWithStake);
        require!(
            staker.pending_rewards == 0,
            EcoQuestError::CannotCloseWithPendingRewards
        );
        // Account closed via `close = user` constraint
        Ok(())
    }

    // ─── PvP Arena ────────────────────────────────────────────────────────────

    /// Initialize the arena singleton.
    pub fn initialize_arena(ctx: Context<InitializeArena>) -> Result<()> {
        let arena = &mut ctx.accounts.arena;
        arena.authority = ctx.accounts.authority.key();
        arena.total_duels = 0;
        arena.bump = ctx.bumps.arena;
        Ok(())
    }

    /// Create a new duel challenge.
    pub fn create_duel(
        ctx: Context<CreateDuel>,
        challenger_nft_id: u64,
        stake_amount: u64,
    ) -> Result<()> {
        require!(stake_amount > 0, EcoQuestError::InvalidAmount);

        let arena = &mut ctx.accounts.arena;
        let duel_index = arena.total_duels;

        let duel = &mut ctx.accounts.duel;
        duel.challenger = ctx.accounts.challenger.key();
        duel.challenger_nft_id = challenger_nft_id;
        duel.stake_amount = stake_amount;
        duel.status = DuelStatus::Open as u8;
        duel.created_at = Clock::get()?.unix_timestamp;
        duel.duel_index = duel_index;
        duel.bump = ctx.bumps.duel;
        duel.defender = Pubkey::default();
        duel.defender_nft_id = 0;
        duel.winner_is_challenger = 0; // 0 = unset, 1 = challenger, 2 = defender

        arena.total_duels = arena
            .total_duels
            .checked_add(1)
            .ok_or(EcoQuestError::Overflow)?;
        Ok(())
    }

    /// Accept an open duel. Defender cannot be the challenger.
    ///
    /// # Security
    /// - PDA seed constraint validates duel authenticity
    /// - Status checked: must be Open
    /// - Self-duel blocked
    pub fn accept_duel(ctx: Context<AcceptDuel>, defender_nft_id: u64) -> Result<()> {
        let duel = &mut ctx.accounts.duel;
        require!(
            duel.status == DuelStatus::Open as u8,
            EcoQuestError::InvalidDuelStatus
        );
        require!(
            duel.challenger != ctx.accounts.defender.key(),
            EcoQuestError::CannotAcceptOwnDuel
        );
        duel.defender = ctx.accounts.defender.key();
        duel.defender_nft_id = defender_nft_id;
        duel.status = DuelStatus::Active as u8;
        Ok(())
    }

    /// Settle a duel — only arena authority can call.
    ///
    /// # Security
    /// - `has_one = authority` on arena
    /// - PDA seed constraint on duel
    /// - Status must be Active
    pub fn settle_duel(
        ctx: Context<SettleDuel>,
        winner_is_challenger: bool,
    ) -> Result<()> {
        let duel = &mut ctx.accounts.duel;
        require!(
            duel.status == DuelStatus::Active as u8,
            EcoQuestError::InvalidDuelStatus
        );
        duel.status = DuelStatus::Settled as u8;
        duel.winner_is_challenger = if winner_is_challenger { 1 } else { 2 };

        emit!(DuelSettledEvent {
            duel_index: duel.duel_index,
            winner_is_challenger,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    // ─── Governance ───────────────────────────────────────────────────────────

    /// Initialize governance singleton.
    pub fn initialize_governance(ctx: Context<InitializeGovernance>) -> Result<()> {
        let governance = &mut ctx.accounts.governance;
        governance.authority = ctx.accounts.authority.key();
        governance.total_proposals = 0;
        governance.bump = ctx.bumps.governance;
        Ok(())
    }

    /// Create a governance proposal.
    ///
    /// # Security
    /// - Fixed-size arrays for title/description (no dynamic alloc)
    /// - Length fields validated
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: [u8; MAX_TITLE_LEN],
        title_len: u8,
        description: [u8; MAX_DESC_LEN],
        description_len: u16,
        quest_reward: u64,
    ) -> Result<()> {
        require!(
            (title_len as usize) <= MAX_TITLE_LEN,
            EcoQuestError::TitleTooLong
        );
        require!(
            (description_len as usize) <= MAX_DESC_LEN,
            EcoQuestError::DescriptionTooLong
        );

        let governance = &mut ctx.accounts.governance;
        let proposal_index = governance.total_proposals;

        let proposal = &mut ctx.accounts.proposal;
        proposal.creator = ctx.accounts.creator.key();
        proposal.title = title;
        proposal.title_len = title_len;
        proposal.description = description;
        proposal.description_len = description_len;
        proposal.quest_reward = quest_reward;
        proposal.yes_votes = 0;
        proposal.no_votes = 0;
        proposal.status = ProposalStatus::Active as u8;
        proposal.created_at = Clock::get()?.unix_timestamp;
        proposal.proposal_index = proposal_index;
        proposal.bump = ctx.bumps.proposal;

        governance.total_proposals = governance
            .total_proposals
            .checked_add(1)
            .ok_or(EcoQuestError::Overflow)?;
        Ok(())
    }

    /// Vote on a proposal. PDA [vote, proposal, voter] ensures one vote per user.
    ///
    /// # Security
    /// - Proposal PDA validated via seeds
    /// - Vote PDA prevents double voting (init fails on collision)
    pub fn vote_on_proposal(ctx: Context<VoteOnProposal>, direction: bool) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(
            proposal.status == ProposalStatus::Active as u8,
            EcoQuestError::ProposalNotActive
        );

        if direction {
            proposal.yes_votes = proposal
                .yes_votes
                .checked_add(1)
                .ok_or(EcoQuestError::Overflow)?;
        } else {
            proposal.no_votes = proposal
                .no_votes
                .checked_add(1)
                .ok_or(EcoQuestError::Overflow)?;
        }

        let vote = &mut ctx.accounts.vote;
        vote.voter = ctx.accounts.voter.key();
        vote.direction = direction;
        vote.voted_at = Clock::get()?.unix_timestamp;
        vote.bump = ctx.bumps.vote;

        emit!(VoteEvent {
            proposal_index: proposal.proposal_index,
            voter: ctx.accounts.voter.key(),
            direction,
        });
        Ok(())
    }

    /// Execute a proposal — only governance authority can call.
    ///
    /// # Security
    /// - `has_one = authority` on governance
    /// - Proposal PDA validated via seeds
    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(
            proposal.status == ProposalStatus::Active as u8,
            EcoQuestError::ProposalNotActive
        );

        if proposal.yes_votes > proposal.no_votes {
            proposal.status = ProposalStatus::Passed as u8;
        } else {
            proposal.status = ProposalStatus::Rejected as u8;
        }
        Ok(())
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Safe Reward Accrual (u128 intermediary)
// ═══════════════════════════════════════════════════════════════════════════════

/// Accrue pending rewards using u128 to prevent overflow.
///
/// Formula: reward = amount * apy_bps * elapsed_seconds / APY_BASIS_POINTS / SECONDS_PER_YEAR
///
/// # Safety
/// - u128 intermediary handles up to ~3.4e38, safe for any realistic stake
/// - Division happens last to maximize precision
/// - Final result checked to fit in u64
fn accrue_rewards(staker: &mut StakerInfo, apy_bps: u32) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let elapsed = now.saturating_sub(staker.last_claim_at) as u128;
    if elapsed == 0 || staker.amount == 0 {
        return Ok(());
    }

    let reward = (staker.amount as u128)
        .checked_mul(apy_bps as u128)
        .ok_or(EcoQuestError::Overflow)?
        .checked_mul(elapsed)
        .ok_or(EcoQuestError::Overflow)?
        .checked_div(APY_BASIS_POINTS)
        .ok_or(EcoQuestError::Overflow)?
        .checked_div(SECONDS_PER_YEAR)
        .ok_or(EcoQuestError::Overflow)?;

    let reward_u64 = u64::try_from(reward).map_err(|_| EcoQuestError::Overflow)?;

    staker.pending_rewards = staker
        .pending_rewards
        .checked_add(reward_u64)
        .ok_or(EcoQuestError::Overflow)?;
    staker.last_claim_at = now;
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT CONTEXTS — All with strict constraints
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Quest ────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeQuestProgram<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = QuestProgram::LEN,
        seeds = [b"quest_program"],
        bump
    )]
    pub quest_program: Account<'info, QuestProgram>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(quest_id: u64)]
pub struct MintNftProof<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"quest_program"],
        bump = quest_program.bump,
    )]
    pub quest_program: Account<'info, QuestProgram>,

    #[account(
        init,
        payer = user,
        space = QuestProof::LEN,
        seeds = [b"quest_proof", quest_id.to_le_bytes().as_ref(), user.key().as_ref()],
        bump
    )]
    pub proof: Account<'info, QuestProof>,
    pub system_program: Program<'info, System>,
}

// ─── Staking ──────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeStakePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Validated in instruction body — owner must be SPL Token program
    pub skr_mint: AccountInfo<'info>,

    #[account(
        init,
        payer = authority,
        space = StakePool::LEN,
        seeds = [b"stake_pool"],
        bump
    )]
    pub pool: Account<'info, StakePool>,

    /// CHECK: Vault token account — seeds validated, owner check in staking instructions
    #[account(
        mut,
        seeds = [b"stake_vault", pool.key().as_ref()],
        bump
    )]
    pub vault: AccountInfo<'info>,

    pub system_program: Program<'info, System>,

    /// CHECK: Validated against known SPL Token program ID
    #[account(address = spl_token_program_id())]
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct InitializeStaker<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = StakerInfo::LEN,
        seeds = [b"staker", user.key().as_ref()],
        bump
    )]
    pub staker: Account<'info, StakerInfo>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeSKR<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stake_pool"],
        bump = pool.bump,
    )]
    pub pool: Account<'info, StakePool>,

    /// CHECK: Validated in instruction body — owner, mint, authority all checked
    #[account(mut)]
    pub user_token_account: AccountInfo<'info>,

    /// CHECK: Validated by PDA seeds + instruction body mint check
    #[account(
        mut,
        seeds = [b"stake_vault", pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"staker", user.key().as_ref()],
        bump = staker.bump,
        constraint = staker.user == user.key() @ EcoQuestError::Unauthorized,
    )]
    pub staker: Account<'info, StakerInfo>,

    /// CHECK: Validated against known SPL Token program ID
    #[account(address = spl_token_program_id())]
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UnstakeSKR<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stake_pool"],
        bump = pool.bump,
    )]
    pub pool: Account<'info, StakePool>,

    /// CHECK: Validated in instruction body — owner, mint checked
    #[account(mut)]
    pub user_token_account: AccountInfo<'info>,

    /// CHECK: Validated by PDA seeds
    #[account(
        mut,
        seeds = [b"stake_vault", pool.key().as_ref()],
        bump = pool.vault_bump,
    )]
    pub vault: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"staker", user.key().as_ref()],
        bump = staker.bump,
        constraint = staker.user == user.key() @ EcoQuestError::Unauthorized,
    )]
    pub staker: Account<'info, StakerInfo>,

    /// CHECK: Validated against known SPL Token program ID
    #[account(address = spl_token_program_id())]
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ClaimStakingRewards<'info> {
    pub user: Signer<'info>,

    #[account(
        seeds = [b"stake_pool"],
        bump = pool.bump,
    )]
    pub pool: Account<'info, StakePool>,

    #[account(
        mut,
        seeds = [b"staker", user.key().as_ref()],
        bump = staker.bump,
        constraint = staker.user == user.key() @ EcoQuestError::Unauthorized,
    )]
    pub staker: Account<'info, StakerInfo>,
}

#[derive(Accounts)]
pub struct DelegateToGuardian<'info> {
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"staker", user.key().as_ref()],
        bump = staker.bump,
        constraint = staker.user == user.key() @ EcoQuestError::Unauthorized,
    )]
    pub staker: Account<'info, StakerInfo>,
}

#[derive(Accounts)]
pub struct CloseStaker<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"staker", user.key().as_ref()],
        bump = staker.bump,
        constraint = staker.user == user.key() @ EcoQuestError::Unauthorized,
        close = user,
    )]
    pub staker: Account<'info, StakerInfo>,
}

// ─── PvP Arena ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeArena<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Arena::LEN,
        seeds = [b"pvp_arena"],
        bump
    )]
    pub arena: Account<'info, Arena>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateDuel<'info> {
    #[account(mut)]
    pub challenger: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pvp_arena"],
        bump = arena.bump,
    )]
    pub arena: Account<'info, Arena>,

    #[account(
        init,
        payer = challenger,
        space = Duel::LEN,
        seeds = [b"duel", arena.total_duels.to_le_bytes().as_ref()],
        bump
    )]
    pub duel: Account<'info, Duel>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptDuel<'info> {
    pub defender: Signer<'info>,

    /// FIX C3: PDA seed constraint validates duel authenticity
    #[account(
        mut,
        seeds = [b"duel", duel.duel_index.to_le_bytes().as_ref()],
        bump = duel.bump,
    )]
    pub duel: Account<'info, Duel>,
}

#[derive(Accounts)]
pub struct SettleDuel<'info> {
    pub authority: Signer<'info>,

    /// FIX: has_one = authority ensures only arena authority can settle
    #[account(
        seeds = [b"pvp_arena"],
        bump = arena.bump,
        has_one = authority @ EcoQuestError::Unauthorized,
    )]
    pub arena: Account<'info, Arena>,

    /// FIX C4: PDA seed constraint validates duel authenticity
    #[account(
        mut,
        seeds = [b"duel", duel.duel_index.to_le_bytes().as_ref()],
        bump = duel.bump,
    )]
    pub duel: Account<'info, Duel>,
}

// ─── Governance ───────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeGovernance<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Governance::LEN,
        seeds = [b"governance"],
        bump
    )]
    pub governance: Account<'info, Governance>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"governance"],
        bump = governance.bump,
    )]
    pub governance: Account<'info, Governance>,

    #[account(
        init,
        payer = creator,
        space = Proposal::LEN,
        seeds = [b"proposal", governance.total_proposals.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VoteOnProposal<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,

    /// FIX H2: PDA seed constraint validates proposal
    #[account(
        mut,
        seeds = [b"proposal", proposal.proposal_index.to_le_bytes().as_ref()],
        bump = proposal.bump,
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        init,
        payer = voter,
        space = Vote::LEN,
        seeds = [b"vote", proposal.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote: Account<'info, Vote>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    pub authority: Signer<'info>,

    /// FIX: has_one ensures only governance authority
    #[account(
        seeds = [b"governance"],
        bump = governance.bump,
        has_one = authority @ EcoQuestError::Unauthorized,
    )]
    pub governance: Account<'info, Governance>,

    /// FIX H3: PDA seed constraint validates proposal
    #[account(
        mut,
        seeds = [b"proposal", proposal.proposal_index.to_le_bytes().as_ref()],
        bump = proposal.bump,
    )]
    pub proposal: Account<'info, Proposal>,
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE ACCOUNTS — Precise sizing, no dynamic allocation
// ═══════════════════════════════════════════════════════════════════════════════

#[account]
pub struct QuestProgram {
    pub authority: Pubkey,           // 32
    pub total_quests_completed: u64, // 8
    pub bump: u8,                    // 1
}
impl QuestProgram {
    // 8 (discriminator) + 32 + 8 + 1 = 49
    pub const LEN: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct QuestProof {
    pub quest_id: u64,                    // 8
    pub user: Pubkey,                     // 32
    pub gps_hash: [u8; 32],              // 32
    pub metadata_uri: [u8; MAX_URI_LEN],  // 200 (fixed, no String overhead)
    pub metadata_uri_len: u8,             // 1
    pub timestamp: i64,                   // 8
    pub bump: u8,                         // 1
}
impl QuestProof {
    // 8 + 8 + 32 + 32 + 200 + 1 + 8 + 1 = 290
    pub const LEN: usize = 8 + 8 + 32 + 32 + MAX_URI_LEN + 1 + 8 + 1;
}

#[account]
pub struct StakePool {
    pub authority: Pubkey, // 32
    pub skr_mint: Pubkey,  // 32
    pub apy_bps: u32,      // 4  (basis points: 10000 = 100%)
    pub total_staked: u64, // 8
    pub bump: u8,          // 1
    pub vault_bump: u8,    // 1
}
impl StakePool {
    // 8 + 32 + 32 + 4 + 8 + 1 + 1 = 86
    pub const LEN: usize = 8 + 32 + 32 + 4 + 8 + 1 + 1;
}

#[account]
pub struct StakerInfo {
    pub user: Pubkey,          // 32
    pub amount: u64,           // 8
    pub pending_rewards: u64,  // 8
    pub last_claim_at: i64,    // 8
    pub guardian_pool: Pubkey,  // 32 (default = Pubkey::default() = none)
    pub is_delegated: bool,    // 1
    pub delegated_at: i64,     // 8
    pub bump: u8,              // 1
}
impl StakerInfo {
    // 8 + 32 + 8 + 8 + 8 + 32 + 1 + 8 + 1 = 106
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 32 + 1 + 8 + 1;
}

#[account]
pub struct Arena {
    pub authority: Pubkey, // 32
    pub total_duels: u64,  // 8
    pub bump: u8,          // 1
}
impl Arena {
    pub const LEN: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct Duel {
    pub challenger: Pubkey,      // 32
    pub challenger_nft_id: u64,  // 8
    pub defender: Pubkey,        // 32 (default = unset)
    pub defender_nft_id: u64,    // 8
    pub stake_amount: u64,       // 8
    pub status: u8,              // 1
    pub winner_is_challenger: u8, // 1 (0=unset, 1=challenger, 2=defender)
    pub created_at: i64,         // 8
    pub duel_index: u64,         // 8
    pub bump: u8,                // 1
}
impl Duel {
    // 8 + 32 + 8 + 32 + 8 + 8 + 1 + 1 + 8 + 8 + 1 = 115
    pub const LEN: usize = 8 + 32 + 8 + 32 + 8 + 8 + 1 + 1 + 8 + 8 + 1;
}

#[account]
pub struct Governance {
    pub authority: Pubkey,    // 32
    pub total_proposals: u64, // 8
    pub bump: u8,             // 1
}
impl Governance {
    pub const LEN: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct Proposal {
    pub creator: Pubkey,                    // 32
    pub title: [u8; MAX_TITLE_LEN],         // 64
    pub title_len: u8,                      // 1
    pub description: [u8; MAX_DESC_LEN],    // 256
    pub description_len: u16,              // 2
    pub quest_reward: u64,                  // 8
    pub yes_votes: u64,                     // 8
    pub no_votes: u64,                      // 8
    pub status: u8,                         // 1
    pub created_at: i64,                    // 8
    pub proposal_index: u64,                // 8
    pub bump: u8,                           // 1
}
impl Proposal {
    // 8 + 32 + 64 + 1 + 256 + 2 + 8 + 8 + 8 + 1 + 8 + 8 + 1 = 405
    pub const LEN: usize = 8 + 32 + MAX_TITLE_LEN + 1 + MAX_DESC_LEN + 2 + 8 + 8 + 8 + 1 + 8 + 8 + 1;
}

#[account]
pub struct Vote {
    pub voter: Pubkey,   // 32
    pub direction: bool, // 1
    pub voted_at: i64,   // 8
    pub bump: u8,        // 1
}
impl Vote {
    pub const LEN: usize = 8 + 32 + 1 + 8 + 1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════════

#[repr(u8)]
#[derive(PartialEq)]
pub enum DuelStatus {
    Open = 0,
    Active = 1,
    Settled = 2,
}

#[repr(u8)]
#[derive(PartialEq)]
pub enum ProposalStatus {
    Active = 0,
    Passed = 1,
    Rejected = 2,
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

#[event]
pub struct StakeEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub total_staked: u64,
    pub timestamp: i64,
}

#[event]
pub struct UnstakeEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub remaining: u64,
    pub timestamp: i64,
}

#[event]
pub struct RewardClaimedEvent {
    pub user: Pubkey,
    pub reward: u64,
    pub timestamp: i64,
}

#[event]
pub struct DelegateEvent {
    pub user: Pubkey,
    pub guardian_pool: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct DuelSettledEvent {
    pub duel_index: u64,
    pub winner_is_challenger: bool,
    pub timestamp: i64,
}

#[event]
pub struct VoteEvent {
    pub proposal_index: u64,
    pub voter: Pubkey,
    pub direction: bool,
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERRORS — Comprehensive with clear messages
// ═══════════════════════════════════════════════════════════════════════════════

#[error_code]
pub enum EcoQuestError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,

    #[msg("Minimum stake is 100 SKR (100_000_000 base units)")]
    BelowMinimumStake,

    #[msg("Insufficient staked amount for withdrawal")]
    InsufficientStakeAmount,

    #[msg("No pending rewards to claim")]
    NoRewardsToClaim,

    #[msg("Cannot close staker account with active stake")]
    CannotCloseWithStake,

    #[msg("Cannot close staker account with pending rewards")]
    CannotCloseWithPendingRewards,

    #[msg("Invalid duel status for this operation")]
    InvalidDuelStatus,

    #[msg("Cannot accept your own duel")]
    CannotAcceptOwnDuel,

    #[msg("Proposal is not in Active status")]
    ProposalNotActive,

    #[msg("Metadata URI exceeds maximum length")]
    InvalidMetadataUri,

    #[msg("Title exceeds maximum length")]
    TitleTooLong,

    #[msg("Description exceeds maximum length")]
    DescriptionTooLong,

    #[msg("Arithmetic overflow detected")]
    Overflow,

    #[msg("Unauthorized: signer is not the expected authority")]
    Unauthorized,

    #[msg("Token account owner does not match expected program")]
    InvalidTokenAccountOwner,

    #[msg("Token account data is malformed or wrong size")]
    InvalidTokenAccountData,

    #[msg("Token account owner does not match user")]
    TokenAccountOwnerMismatch,

    #[msg("Token account mint does not match pool's SKR mint")]
    TokenAccountMintMismatch,

    #[msg("Mint account owner is not SPL Token program")]
    InvalidMintOwner,

    #[msg("Invalid guardian pool address")]
    InvalidGuardianPool,
}
