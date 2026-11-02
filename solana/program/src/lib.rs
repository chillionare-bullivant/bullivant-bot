use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    pubkey::Pubkey,
};

// Declare program entrypoint
entrypoint!(process_instruction);

// Program instruction logic
pub fn process_instruction(
    program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> ProgramResult {
    msg!("==================================================");
    msg!("⚡ Bullivant Solana Program Executed Successfully!");
    msg!("Program ID: {}", program_id);
    msg!("Network:    Solana Devnet (Alchemy RPC)");
    msg!("==================================================");
    Ok(())
}
