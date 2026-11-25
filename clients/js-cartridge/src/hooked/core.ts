import { MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import { Context, PublicKey } from '@metaplex-foundation/umi';

/**
 * True if the fetched account is owned by the mpl-core program. mpl-core's
 * `fetchAsset` and `fetchCollection` check only the data layout, so another
 * program could hold Core-shaped bytes.
 */
export function ownedByCore(
  context: Pick<Context, 'programs'>,
  account: { header: { owner: PublicKey } }
): boolean {
  return (
    account.header.owner ===
    context.programs.getPublicKey('mplCore', MPL_CORE_PROGRAM_ID)
  );
}
