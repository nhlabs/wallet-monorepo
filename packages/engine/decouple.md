- handleDisplayPassphraseWallet 改成上层调用方法时传参回调，不要直接引入上层模块
- @mywallet/kit/src/utils/hardware 
- import { deviceUtils } from '@mywallet/kit/src/utils/hardware';
- engine listNetworks dbNetworkToNetwork getVaultSettings getChainOnlyVault
  - settings decouple from vault
