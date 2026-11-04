import { findAssociatedTokenPda } from '@metaplex-foundation/mpl-toolbox';
import { Context, PublicKey } from '@metaplex-foundation/umi';
import { GameCollectionData } from '../generated';
import { USDC_MINT } from './gameData';

/**
 * The payment accounts `printGameCartridgeV1` needs for this game. The
 * generated defaults are CRUMBS; USDC games pay into the publisher's USDC
 * token account instead of the game's. Spread the result into the call.
 */
export function findPrintPaymentAccounts(
  context: Pick<Context, 'eddsa' | 'programs'>,
  input: { game: PublicKey; payer: PublicKey; data: GameCollectionData }
): {
  paymentMint: PublicKey;
  gameTokenAccount: PublicKey;
  payerTokenAccount: PublicKey;
} {
  const mint = input.data.paymentMint;
  const payee = mint === USDC_MINT ? input.data.publisher : input.game;
  const [gameTokenAccount] = findAssociatedTokenPda(context, {
    mint,
    owner: payee,
  });
  const [payerTokenAccount] = findAssociatedTokenPda(context, {
    mint,
    owner: input.payer,
  });
  return { paymentMint: mint, gameTokenAccount, payerTokenAccount };
}
