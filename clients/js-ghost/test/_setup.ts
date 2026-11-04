/* eslint-disable import/no-extraneous-dependencies */
import { createUmi as basecreateUmi } from '@metaplex-foundation/umi-bundle-tests';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { bglGhost } from '../src';

export const createUmi = async () =>
  (await basecreateUmi()).use(mplToolbox()).use(bglGhost());
