import {
  COINTYPE_TRON,
  INDEX_PLACEHOLDER,
} from '@mywallet/shared/src/engine/engineConsts';

import type { IVaultSettings } from '../../types';

const settings: IVaultSettings = Object.freeze({
  feeInfoEditable: false,
  privateKeyExportEnabled: true,
  tokenEnabled: true,
  txCanBeReplaced: false,

  importedAccountEnabled: true,
  hardwareAccountEnabled: true,
  externalAccountEnabled: false,
  watchingAccountEnabled: true,

  isUTXOModel: false,

  cannotSendToSelf: true,

  accountNameInfo: {
    default: {
      prefix: 'TRON',
      category: `44'/${COINTYPE_TRON}'`,
      template: `m/44'/${COINTYPE_TRON}'/0'/0/${INDEX_PLACEHOLDER}`,
      coinType: COINTYPE_TRON,
    },
  },
});

export default settings;
