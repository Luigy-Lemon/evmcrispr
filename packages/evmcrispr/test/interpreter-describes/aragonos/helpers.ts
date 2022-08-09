import { expect } from 'chai';
import type { Signer } from 'ethers';
import { ethers } from 'hardhat';

import { NodeType } from '../../../src/cas11/types';

import { ComparisonType } from '../../../src/cas11/utils';

import {
  itChecksInvalidArgsLength,
  runExpression,
} from '../../test-helpers/cas11';

export const helpersDescribe = (): Mocha.Suite =>
  describe('Helpers', () => {
    let signer: Signer;
    const lazySigner = () => signer;

    before(async () => {
      [signer] = await ethers.getSigners();
    });

    describe('@aragonEns()', () => {
      it('should interpret it correctly', async () => {
        const repoRes = await runExpression(
          '@aragonEns(hooked-token-manager-no-controller.open.aragonpm.eth)',
          signer,
          'aragonos',
        );
        const daoRes = await runExpression(
          `@aragonEns(hive.aragonid.eth)`,
          signer,
          'aragonos',
        );

        expect(repoRes, 'Repo address mismatch').to.equals(
          '0xe4247F171f823e226E3F8617Eec606Eb55B54b7a',
        );
        expect(daoRes, 'DAO address mismatch').to.equals(
          `0xe520428C232F6Da6f694b121181f907931fD2211`,
        );
      });

      itChecksInvalidArgsLength(
        NodeType.HelperFunctionExpression,
        '@aragonEns',
        ['mydao.aragonid.eth', '0x98Df287B6C145399Aaa709692c8D308357bC085D'],
        { type: ComparisonType.Between, minValue: 1, maxValue: 2 },
        lazySigner,
        'aragonos',
      );
    });
  });
