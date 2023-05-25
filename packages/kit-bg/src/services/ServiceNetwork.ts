/* eslint-disable @typescript-eslint/require-await */
import { debounce } from 'lodash';

import simpleDb from '@mywallet/engine/src/dbs/simple/simpleDb';
import { fetchChainList } from '@mywallet/engine/src/managers/network';
import type {
  AddNetworkParams,
  Network,
  UpdateNetworkParams,
} from '@mywallet/engine/src/types/network';
import type { IFeeInfoUnit } from '@mywallet/engine/src/vaults/types';
import type { GeneralInitialState } from '@mywallet/kit/src/store/reducers/general';
import { changeActiveNetwork } from '@mywallet/kit/src/store/reducers/general';
import reducerAccountSelector from '@mywallet/kit/src/store/reducers/reducerAccountSelector';
import { updateNetworks } from '@mywallet/kit/src/store/reducers/runtime';
import {
  clearNetworkCustomRpcs,
  updateCustomNetworkRpc,
} from '@mywallet/kit/src/store/reducers/settings';
import type { IRpcStatus } from '@mywallet/kit/src/store/reducers/status';
import {
  setRpcStatus,
  updateUserSwitchNetworkFlag,
} from '@mywallet/kit/src/store/reducers/status';
import { getTimeDurationMs, wait } from '@mywallet/kit/src/utils/helper';
import {
  backgroundClass,
  backgroundMethod,
  bindThis,
} from '@mywallet/shared/src/background/backgroundDecorators';
import { IMPL_EVM } from '@mywallet/shared/src/engine/engineConsts';
import {
  AppEventBusNames,
  appEventBus,
} from '@mywallet/shared/src/eventBus/appEventBus';
import debugLogger from '@mywallet/shared/src/logger/debugLogger';
import NetInfo from '@mywallet/shared/src/modules3rdParty/@react-native-community/netinfo';

import ServiceBase from './ServiceBase';

import type ProviderApiBase from '../providers/ProviderApiBase';
import type { IJsonRpcRequest } from '@onekeyfe/cross-inpage-provider-types';

const accountSelectorActions = reducerAccountSelector.actions;

NetInfo.configure({
  reachabilityShouldRun: () => false,
});

const rpcUrlSupportBatchCheckTimestampMap: Map<string, number> = new Map();

@backgroundClass()
class ServiceNetwork extends ServiceBase {
  rpcMeasureInterval: NodeJS.Timeout | null = null;

  @bindThis()
  registerEvents() {
    appEventBus.on(
      AppEventBusNames.NetworkChanged,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      this.measureRpcStatus,
    );

    this.rpcMeasureInterval = setInterval(
      // eslint-disable-next-line @typescript-eslint/unbound-method
      this.measureRpcStatus,
      getTimeDurationMs({ minute: 1 }),
    );

    NetInfo.addEventListener(() => {
      this.measureRpcStatus();
    });

    this.measureRpcStatus();
  }

  @backgroundMethod()
  async changeActiveNetwork(
    networkId: NonNullable<GeneralInitialState['activeNetworkId']>,
  ) {
    const { appSelector, serviceAccount } = this.backgroundApi;
    const { activeWalletId, activeNetworkId, activeAccountId } = appSelector(
      (s) => s.general,
    );
    const networks: Network[] = appSelector((s) => s.runtime.networks);
    const previousNetwork = networks.find(
      (network) => network.id === activeNetworkId,
    );
    const newNetwork = networks.find((network) => network.id === networkId);

    if (newNetwork && !newNetwork?.enabled) {
      await this.updateNetworks(
        networks.map((n) => [n.id, n.id === newNetwork.id ? true : n.enabled]),
      );
      newNetwork.enabled = true;
    }

    this.backgroundApi.engine.notifyChainChanged(
      networkId,
      activeNetworkId ?? '',
    );
    const changeActiveNetworkActions = [
      changeActiveNetwork(networkId),
      accountSelectorActions.updateSelectedNetworkId(networkId),
    ];
    let shouldDispatch = true;
    this.notifyChainChanged();

    const implChange = previousNetwork?.impl !== newNetwork?.impl;
    // Use symbol to determine chainId changes
    const chainIdChange = previousNetwork?.symbol !== newNetwork?.symbol;
    const forceRefreshAccount =
      chainIdChange && serviceAccount.shouldForceRefreshAccount(newNetwork?.id);
    const { shouldChangeActiveAccount, shouldReloadAccountList } =
      await serviceAccount.shouldChangeAccountWhenNetworkChanged({
        previousNetwork,
        newNetwork,
        activeAccountId,
      });

    if (implChange || forceRefreshAccount || shouldChangeActiveAccount) {
      // 当切换了不同 impl 类型的链时更新 accounts 内容
      // 有一些特殊的链比如 Cosmos，如果 chainId 改变了，需要更新 accounts 内容
      const accounts = await serviceAccount.reloadAccountsByWalletIdNetworkId(
        activeWalletId,
        networkId,
      );
      const firstAccount = accounts && accounts[0];
      // TODO cache last active account of network, NOT hardcode to firstAccount
      if (firstAccount || forceRefreshAccount) {
        await serviceAccount.changeActiveAccount({
          accountId: firstAccount?.id ?? null,
          walletId: activeWalletId,
          extraActions: [...changeActiveNetworkActions], // dispatch batch actions
          // as reloadAccountsByWalletIdNetworkId() has been called before
          shouldReloadAccountsWhenWalletChanged: false,
        });
        shouldDispatch = false;
      }
    }
    // Refresh the list of accounts only, without switching activeAccount
    if (shouldReloadAccountList) {
      await serviceAccount.reloadAccountsByWalletIdNetworkId(
        activeWalletId,
        networkId,
      );
    }
    if (shouldDispatch) {
      this.backgroundApi.dispatch(...changeActiveNetworkActions);
    }
    return newNetwork;
  }

  @backgroundMethod()
  async notifyChainChanged(): Promise<void> {
    await wait(600);
    Object.values(this.backgroundApi.providers).forEach(
      (provider: ProviderApiBase) => {
        provider.notifyDappChainChanged({
          send: this.backgroundApi.sendForProvider(provider.providerName),
        });
      },
    );
    await this.backgroundApi.walletConnect.notifySessionChanged();
    // emit at next tick
    await wait(100);
    appEventBus.emit(AppEventBusNames.NetworkChanged);
  }

  @backgroundMethod()
  async updateNetworks(networks: [string, boolean][]) {
    const { engine, dispatch } = this.backgroundApi;
    const res = await engine.updateNetworkList(networks);
    dispatch(updateNetworks(res));
  }

  @backgroundMethod()
  async initNetworks() {
    const { engine } = this.backgroundApi;
    await engine.syncPresetNetworks();
    await this.fetchNetworks();
    return engine.listNetworks(true);
  }

  @backgroundMethod()
  async fetchNetworks() {
    const { engine, dispatch } = this.backgroundApi;
    const networks = await engine.listNetworks(false);
    dispatch(updateNetworks(networks));
    return networks;
  }

  @backgroundMethod()
  async getPresetRpcEndpoints(networkId: string) {
    const { engine } = this.backgroundApi;
    return engine.getRPCEndpoints(networkId);
  }

  @backgroundMethod()
  async updateNetwork(
    networkid: string,
    params: UpdateNetworkParams,
    isUserSwitched = true,
  ) {
    const { engine, appSelector, dispatch } = this.backgroundApi;
    const network = await engine.updateNetwork(networkid, params);
    if (params.rpcURL) {
      const { userSwitchedNetworkRpcFlag } = appSelector((s) => s.status);
      if (isUserSwitched && !userSwitchedNetworkRpcFlag?.[networkid]) {
        dispatch(
          updateUserSwitchNetworkFlag({ networkId: networkid, flag: true }),
        );
        await wait(600);
      }
    }
    this.fetchNetworks();
    return network;
  }

  @backgroundMethod()
  async addNetwork(impl: string, params: AddNetworkParams) {
    const { engine, dispatch } = this.backgroundApi;
    const network = await engine.addNetwork(impl, params);
    dispatch(
      updateCustomNetworkRpc({
        networkId: network.id,
        type: 'add',
        rpc: params.rpcURL,
      }),
    );
    this.fetchNetworks();
    return network;
  }

  @backgroundMethod()
  async deleteNetwork(networkId: string) {
    const { engine, dispatch } = this.backgroundApi;
    await engine.deleteNetwork(networkId);
    dispatch(clearNetworkCustomRpcs({ networkId }));
    this.fetchNetworks();
  }

  @backgroundMethod()
  async rpcCall(networkId: string, request: IJsonRpcRequest) {
    const { engine } = this.backgroundApi;
    return engine.proxyJsonRPCCall(networkId, request);
  }

  @backgroundMethod()
  async preAddNetwork(rpcURL: string) {
    const { engine } = this.backgroundApi;
    return engine.preAddNetwork(rpcURL);
  }

  @backgroundMethod()
  async getRPCEndpointStatus(
    rpcURL: string,
    networkId: string,
    useCache = true,
  ) {
    const { engine } = this.backgroundApi;
    return engine.getRPCEndpointStatus(rpcURL, networkId, useCache);
  }

  @backgroundMethod()
  initCheckingNetwork(networks: Network[]): string | null {
    const { appSelector } = this.backgroundApi;
    // first time read from local storage
    const previousActiveNetworkId: string | null = appSelector(
      (s) => s.general.activeNetworkId,
    );
    const isValidNetworkId = networks.some(
      (network) => network.id === previousActiveNetworkId,
    );
    if (!previousActiveNetworkId || !isValidNetworkId) {
      return networks[0]?.id ?? null;
    }
    return previousActiveNetworkId;
  }

  @backgroundMethod()
  getCustomRpcUrls(networkId: string) {
    const { appSelector } = this.backgroundApi;
    return Promise.resolve(
      appSelector((s) => s.settings.customNetworkRpcMap?.[networkId] || []),
    );
  }

  @backgroundMethod()
  fetchChainList(params: {
    query: string;
    showTestNet: boolean;
    page: number;
    pageSize: number;
  }) {
    return fetchChainList(params);
  }

  @backgroundMethod()
  async getNetworkCustomFee(networkId: string) {
    const customFee = await this.backgroundApi.engine.dbApi.getCustomFee(
      networkId,
    );
    if (customFee) {
      return {
        price: customFee.price,
        eip1559: customFee.eip1559,
        price1559: {
          baseFee: customFee.price1559?.baseFee,
          maxFeePerGas: customFee.price1559?.maxFeePerGas,
          maxPriorityFeePerGas: customFee.price1559?.maxPriorityFeePerGas,
        },
        isBtcForkChain: customFee.isBtcForkChain,
        feeRate: customFee.feeRate,
        btcFee: customFee.btcFee,
      } as IFeeInfoUnit;
    }
  }

  @backgroundMethod()
  async updateNetworkCustomFee(
    networkId: string,
    customFee: IFeeInfoUnit | null | undefined,
  ) {
    this.backgroundApi.engine.dbApi.updateCustomFee(networkId, customFee);
  }

  @backgroundMethod()
  async getNetworkWithRuntime(networkId: string) {
    const { appSelector } = this.backgroundApi;
    const network = appSelector((s) =>
      s.runtime.networks.find((n) => n.id === networkId),
    );
    return Promise.resolve(network);
  }

  measureRpcStatus = debounce(
    // eslint-disable-next-line @typescript-eslint/unbound-method
    this._measureRpcStatus,
    getTimeDurationMs({ seconds: 5 }),
    {
      leading: true,
      trailing: true,
    },
  );

  @bindThis()
  @backgroundMethod()
  async _measureRpcStatus(_networkId?: string) {
    let networkId: string | undefined | null = _networkId;
    const { appSelector, engine, dispatch, serviceApp } = this.backgroundApi;
    if (!serviceApp.isAppInited) {
      await serviceApp.waitForAppInited({
        logName: 'measureRpcStatus',
      });
    }
    if (!networkId) {
      networkId = appSelector((s) => s.general.activeNetworkId);
    }
    if (!networkId) {
      return;
    }
    let status: IRpcStatus = {
      responseTime: undefined,
      latestBlock: undefined,
    };
    const network = await engine.getNetwork(networkId);
    const url = network.rpcURL;
    const whitelistHosts =
      await simpleDb.setting.getRpcBatchFallbackWhitelistHosts();

    const item = whitelistHosts.find((n) => url.includes(n.url));
    const isRpcInWhitelistHost = !!item;

    try {
      if (networkId.startsWith(IMPL_EVM)) {
        const vault = await engine.getChainOnlyVault(networkId);
        status = await vault.checkRpcBatchSupport(url);
      } else {
        status = await this.getRPCEndpointStatus(url, networkId, false);
      }

      if (networkId.startsWith(IMPL_EVM)) {
        const ts = rpcUrlSupportBatchCheckTimestampMap.get(url);
        if (status.rpcBatchSupported === false && !isRpcInWhitelistHost) {
          if (!ts || Date.now() - ts > getTimeDurationMs({ day: 1 })) {
            debugLogger.http.info('add rpc to whitelistHosts', url, ts);
            await simpleDb.setting.addRpcBatchFallbackWhitelistHosts(url);
          }
        }

        if (status.rpcBatchSupported !== false) {
          rpcUrlSupportBatchCheckTimestampMap.set(url, Date.now());
        }

        if (
          status.rpcBatchSupported !== false &&
          isRpcInWhitelistHost &&
          item.type === 'custom'
        ) {
          debugLogger.http.info('remove rpc from whitelistHosts', url, ts);
          await simpleDb.setting.removeRpcBatchFallbackWhitelistHosts(url);
        }
      }
    } catch (error) {
      // pass
      debugLogger.http.error('measureRpcStatus ERROR', error);
    }

    dispatch(
      setRpcStatus({
        networkId,
        status,
      }),
    );

    return status;
  }
}

export default ServiceNetwork;
