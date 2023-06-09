const developmentConsts = require('./developmentConsts');

const webModuleTranspile = [
  'moti',
  '@gorhom',
  '@mysten/sui.js',
  'superstruct',
  '@noble/curves',
  '@polkadot',
  '@solana/web3.js',
  '@kaspa/core-lib',
  '@zondax/izari-filecoin',
];

const substrateModules = ['@substrate/txwrapper-core'];

const polkadotModules = [
  '@polkadot/api',
  '@polkadot/wasm-bridge',
  '@polkadot/types-codec',
  '@polkadot/rpc-provider',
  '@polkadot/rpc-core',
  '@polkadot/types',
  '@polkadot/util',
  '@polkadot/util-crypto',
  '@polkadot/keyring',
];

const extModuleTranspile = [
  ...substrateModules,
  ...polkadotModules,
  '@mywallet/blockchain-libs',
  '@mywallet/components',
  '@mywallet/kit',
  '@mywallet/kit-bg',
  '@mywallet/shared',
  '@mywallet/engine',
  '@mywallet/app',
  'react-native-animated-splash-screen',
  'moti',
  'popmotion',
  '@mysten/sui.js',
  'superstruct',
  '@noble/curves',
  '@solana/web3.js',
  '@zondax/izari-filecoin',
  '@kaspa/core-lib',
  ...(developmentConsts.isManifestV3
    ? [
        // '@blitslabs/filecoin-js-signer'
      ]
    : []),
];

module.exports = {
  webModuleTranspile,
  extModuleTranspile,
};
