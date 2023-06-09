import type { FC } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { HardwareErrorCode } from '@onekeyfe/hd-shared';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useIntl } from 'react-intl';
import { StyleSheet } from 'react-native';

import {
  Badge,
  Box,
  Center,
  HStack,
  Icon,
  Image,
  LottieView,
  Modal,
  ScrollView,
  Spinner,
  ToastManager,
  Typography,
  VStack,
} from '@mywallet/components';
import ClassicDeviceIcon from '@mywallet/components/img/deviceIcon_classic.png';
import MiniDeviceIcon from '@mywallet/components/img/deviceIcon_mini.png';
import TouchDeviceIcon from '@mywallet/components/img/deviceicon_touch.png';
import PressableItem from '@mywallet/components/src/Pressable/PressableItem';
import type { OneKeyHardwareError } from '@mywallet/engine/src/errors';
import { OneKeyErrorClassNames } from '@mywallet/engine/src/errors';
import type { Device } from '@mywallet/engine/src/types/device';
import type { Wallet } from '@mywallet/engine/src/types/wallet';
import KeepDeviceAroundSource from '@mywallet/kit/assets/wallet/keep_device_close.png';
import backgroundApiProxy from '@mywallet/kit/src/background/instance/backgroundApiProxy';
import NeedBridgeDialog from '@mywallet/kit/src/components/NeedBridgeDialog';
import { useRuntime } from '@mywallet/kit/src/hooks/redux';
import type { CreateWalletRoutesParams } from '@mywallet/kit/src/routes/Root/Modal/CreateWallet';
import {
  CreateWalletModalRoutes,
  ModalRoutes,
  RootRoutes,
} from '@mywallet/kit/src/routes/routesEnum';
import type {
  ModalScreenProps,
  RootRoutesParams,
} from '@mywallet/kit/src/routes/types';
import type { SearchDevice } from '@mywallet/kit/src/utils/hardware';
import { deviceUtils } from '@mywallet/kit/src/utils/hardware';
import debugLogger from '@mywallet/shared/src/logger/debugLogger';
import platformEnv from '@mywallet/shared/src/platformEnv';
import type { IOneKeyDeviceType } from '@mywallet/shared/types';

import {
  BleLocationServiceError,
  InitIframeLoadFail,
  InitIframeTimeout,
  NeedBluetoothPermissions,
  NeedBluetoothTurnedOn,
} from '../../../utils/hardware/errors';
import { showDialog } from '../../../utils/overlayUtils';

import type { RouteProp } from '@react-navigation/native';

type NavigationProps = ModalScreenProps<RootRoutesParams> &
  ModalScreenProps<CreateWalletRoutesParams>;

type RouteProps = RouteProp<
  CreateWalletRoutesParams,
  CreateWalletModalRoutes.ConnectHardwareModal
>;

const getDeviceIcon = (
  type: IOneKeyDeviceType,
): import('react-native').ImageSourcePropType | undefined => {
  switch (type) {
    case 'classic':
      return ClassicDeviceIcon as number;
    case 'mini':
      return MiniDeviceIcon as number;
    case 'touch':
      return TouchDeviceIcon as number;
    default:
      return undefined;
  }
};

type SearchDeviceInfo = {
  using?: Wallet;
  useBefore?: Wallet;
} & SearchDevice;

type ExistHwWallet = Wallet & {
  connectId: string;
  deviceId: string;
};

const ConnectHardwareModal: FC = () => {
  const intl = useIntl();
  const { engine, serviceHardware } = backgroundApiProxy;
  const navigation = useNavigation<NavigationProps['navigation']>();
  const { entry } = useRoute<RouteProps>().params ?? {};
  const [isSearching, setIsSearching] = useState(false);
  const [isConnectingDeviceId, setIsConnectingDeviceId] = useState('');

  const [searchedDevices, setSearchedDevices] = useState<SearchDevice[]>([]);
  /**
   * Ensure that the search is completed for this round
   */
  const searchStateRef = useRef<'start' | 'stop'>('stop');
  const [checkBonded, setCheckBonded] = useState(false);
  const [devices, setDevices] = useState<SearchDeviceInfo[]>([]);

  const { wallets } = useRuntime();
  const [existHwWallets, setExistHwWallets] = useState<ExistHwWallet[]>();

  useEffect(() => {
    (async () => {
      const localDevices = (await engine.getHWDevices()).reduce<
        Record<string, Device>
      >((acc, device) => ({ ...acc, [device.id ?? '']: device }), {});

      const hwWallets = wallets
        .filter(
          (w) =>
            w.type === 'hw' &&
            w.accounts.length > 0 &&
            !!localDevices[w.associatedDevice ?? ''],
        )
        .map((w) => ({
          ...w,
          deviceId: localDevices[w.associatedDevice ?? ''].deviceId,
          connectId: localDevices[w.associatedDevice ?? ''].mac,
        }));

      setExistHwWallets(hwWallets);
    })();
  }, [engine, wallets]);

  const handleStopDevice = useCallback(() => {
    if (!deviceUtils) return;
    deviceUtils.stopScan();
  }, []);

  const convert = useCallback(
    (searchDevices: SearchDevice[]): SearchDeviceInfo[] => {
      const convertDevices = searchDevices.map((device) => ({
        ...device,
        using: existHwWallets?.find(
          (w) =>
            w.connectId === device.connectId && w.deviceId === device.deviceId,
        ),
        useBefore: existHwWallets?.find(
          (w) => w.connectId === device.connectId,
        ),
      }));
      return convertDevices;
    },
    [existHwWallets],
  );

  useEffect(() => {
    setDevices(convert(searchedDevices));
  }, [convert, searchedDevices]);

  const handleScanDevice = useCallback(async () => {
    if (!deviceUtils) return;
    setIsSearching(true);

    const checkBridge = await serviceHardware.checkBridge();
    if (typeof checkBridge === 'boolean' && !checkBridge) {
      showDialog(<NeedBridgeDialog />);
      return;
    }
    if (
      (checkBridge as unknown as OneKeyHardwareError).className ===
      OneKeyErrorClassNames.OneKeyHardwareError
    ) {
      if (platformEnv.isDesktop) {
        window.desktopApi.reloadBridgeProcess();
        ToastManager.show(
          {
            title: intl.formatMessage({
              id: (checkBridge as unknown as OneKeyHardwareError).key,
            }),
          },
          {
            type: 'default',
          },
        );
      } else {
        showDialog(<NeedBridgeDialog />);
      }
      return;
    }
    deviceUtils.startDeviceScan(
      (response) => {
        if (!response.success) {
          const error = deviceUtils.convertDeviceError(response.payload);
          if (platformEnv.isNative) {
            if (
              !(error instanceof NeedBluetoothTurnedOn) &&
              !(error instanceof NeedBluetoothPermissions) &&
              !(error instanceof BleLocationServiceError)
            ) {
              ToastManager.show(
                {
                  title: intl.formatMessage({
                    id: error.key,
                  }),
                },
                { type: 'error' },
              );
            } else {
              deviceUtils.stopScan();
            }
          } else if (
            error instanceof InitIframeLoadFail ||
            error instanceof InitIframeTimeout
          ) {
            ToastManager.show(
              {
                title: intl.formatMessage({
                  id: error.key,
                }),
              },
              { type: 'error' },
            );
            deviceUtils.stopScan();
          }
          setIsSearching(false);
          return;
        }

        setSearchedDevices(response.payload);
      },
      (state) => {
        searchStateRef.current = state;
      },
    );
  }, [intl, serviceHardware]);

  useEffect(() => {
    if (platformEnv.isRuntimeBrowser) handleScanDevice();
    return () => {
      handleStopDevice();
      deviceUtils.stopCheckBonded();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const waitPreviousSearchFinished = (device: SearchDevice) =>
    new Promise<void>((resolve) => {
      if (!deviceUtils) return;
      if (!device.connectId) return;

      deviceUtils.stopScan();
      setIsConnectingDeviceId(device.connectId);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      timerRef.current = setInterval(() => {
        if (searchStateRef.current === 'stop') {
          clearInterval(timerRef.current);
          resolve();
        }
      }, 100);
    });
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = undefined;
      }
    },
    [],
  );

  const handleConnectDeviceWithDevice = useCallback(
    async (device: SearchDevice) => {
      await waitPreviousSearchFinished(device);
      debugLogger.hardwareSDK.debug('========= will connect =========');
      const finishConnected = (result?: boolean) => {
        setIsConnectingDeviceId('');
        if (!result) {
          ToastManager.show(
            {
              title: intl.formatMessage({
                id: 'modal__failed_to_connect',
              }),
            },
            { type: 'error' },
          );
          return;
        }
        navigation.navigate(RootRoutes.Modal, {
          screen: ModalRoutes.CreateWallet,
          params: {
            screen: CreateWalletModalRoutes.DeviceStatusCheckModal,
            params: {
              device,
              entry,
            },
          },
        });
      };
      serviceHardware
        .connect(device.connectId ?? '')
        .then((result) => {
          finishConnected(result);
        })
        .catch(async (err: any) => {
          const { code } = err || {};
          if (code === HardwareErrorCode.BleDeviceNotBonded) {
            if (!checkBonded && platformEnv.isNativeAndroid) {
              setCheckBonded(true);
              const bonded = await deviceUtils.checkDeviceBonded(
                device.connectId ?? '',
              );
              setCheckBonded(false);
              if (bonded) {
                debugLogger.hardwareSDK.debug(
                  'Android device was bonded, will connect',
                );
                serviceHardware.connect(device.connectId ?? '').then((r) => {
                  setTimeout(() => finishConnected(r), 1000);
                });
              } else {
                debugLogger.hardwareSDK.debug(
                  'Android device check bonded timeout',
                );
                finishConnected(false);
              }
            }
          } else {
            setIsConnectingDeviceId('');

            deviceUtils.showErrorToast(err, 'action__connection_timeout');
          }
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serviceHardware, navigation, intl, checkBonded],
  );

  const renderDevices = useCallback(() => {
    if (!devices?.length) return null;
    return (
      <VStack space={4} w="full">
        <Typography.Body2 color="text-subdued" textAlign="center">
          {intl.formatMessage({ id: 'modal__looking_for_devices_result' })}
        </Typography.Body2>
        {devices.map((device, index) => (
          <PressableItem
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            px="16px"
            py="12px"
            key={`${index}-${device?.connectId ?? ''}`}
            bgColor="action-secondary-default"
            borderRadius="12px"
            borderWidth={StyleSheet.hairlineWidth}
            borderColor="border-default"
            // disabled={!!device.using}
            onPress={() => {
              handleConnectDeviceWithDevice(device);
            }}
          >
            <HStack space={3} alignItems="center">
              {/* TODO: Different type of icon */}
              <Image
                source={getDeviceIcon(device.deviceType)}
                width={6}
                height={36}
              />
              <Typography.Body1>{device.name}</Typography.Body1>
            </HStack>

            {/* {device.using ? (
              <HStack alignItems="center">
                <Badge
                  size="sm"
                  title={intl.formatMessage({ id: 'content__existing' })}
                  type="success"
                />
              </HStack>
            ) : ( */}
            <HStack space={3} alignItems="center">
              {!!device.useBefore && platformEnv.isNative && (
                <Badge
                  size="sm"
                  title={intl.formatMessage({
                    id: 'content__have_been_connected',
                  })}
                  type="success"
                />
              )}
              {isConnectingDeviceId === device.connectId && (
                <Spinner size="sm" />
              )}
              <Icon name="ChevronRightMini" color="icon-subdued" size={20} />
            </HStack>
            {/* )} */}
          </PressableItem>
        ))}
      </VStack>
    );
  }, [devices, handleConnectDeviceWithDevice, isConnectingDeviceId, intl]);

  // Mobile Connect Screen
  const renderConnectScreen = () => {
    if (!isSearching) {
      return (
        <VStack space={8} w="full" alignItems="center">
          <Box size="358px">
            <Image size="358px" source={KeepDeviceAroundSource} />
          </Box>

          <VStack space={2} alignItems="center">
            <Typography.DisplayLarge>
              {intl.formatMessage({ id: 'modal__keep_device_close' })}
            </Typography.DisplayLarge>
            <Typography.Body1 color="text-subdued" textAlign="center">
              {intl.formatMessage({ id: 'model__keep_device_close_desc' })}
            </Typography.Body1>
          </VStack>
        </VStack>
      );
    }
    return (
      <ScrollView w="full">
        <VStack space={12} alignItems="center">
          <Box w="358px" h="220px" mb={-4}>
            <LottieView
              // eslint-disable-next-line global-require
              source={require('@mywallet/kit/assets/animations/lottie_connect_onekey_by_bluetooth.json')}
              autoPlay
              loop
            />
          </Box>

          <VStack space={2} alignItems="center">
            <Typography.DisplayLarge>
              {intl.formatMessage({ id: 'modal__looking_for_devices' })}
            </Typography.DisplayLarge>
            <Typography.Body1 color="text-subdued" textAlign="center">
              {intl.formatMessage({ id: 'modal__looking_for_devices_desc' })}
            </Typography.Body1>
          </VStack>

          {renderDevices()}
        </VStack>
      </ScrollView>
    );
  };

  const content = platformEnv.isNative ? (
    <Center>{renderConnectScreen()}</Center>
  ) : (
    <VStack space={8} alignItems="center">
      <Box>
        <LottieView
          // eslint-disable-next-line global-require
          source={require('@mywallet/kit/assets/animations/lottie_connect_onekey_by_usb.json')}
          autoPlay
          loop
        />
      </Box>

      <Typography.DisplayMedium>
        {intl.formatMessage({ id: 'modal__connect_your_device' })}
      </Typography.DisplayMedium>
      {renderDevices()}
    </VStack>
  );

  return (
    <Modal
      scrollViewProps={{
        children: content,
        contentContainerStyle: {
          height: '100%',
          paddingBottom: 24,
        },
      }}
      hidePrimaryAction={!platformEnv.isNative}
      footer={!platformEnv.isNative || isSearching ? null : undefined}
      primaryActionTranslationId="action__connect_device"
      onPrimaryActionPress={handleScanDevice}
      hideSecondaryAction
    />
  );
};

export default ConnectHardwareModal;
