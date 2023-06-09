import type { ReactElement } from 'react';

import { MotiView } from 'moti';
import { PermissionsAndroid, Platform } from 'react-native';
import RootSiblingsManager from 'react-native-root-siblings';

import { OverlayContainer } from '@mywallet/components';
import { CloseBackDrop } from '@mywallet/components/src/Select';
import backgroundApiProxy from '@mywallet/kit/src/background/instance/backgroundApiProxy';
import NeedBridgeDialog from '@mywallet/kit/src/components/NeedBridgeDialog';
import PermissionDialog from '@mywallet/kit/src/components/PermissionDialog/PermissionDialog';
import { getAppNavigation } from '@mywallet/kit/src/hooks/useAppNavigation';
import { CoreSDKLoader } from '@mywallet/shared/src/device/hardwareInstance';
import platformEnv from '@mywallet/shared/src/platformEnv';

import { showDialog } from '../../../utils/overlayUtils';

import EnterPassphraseView from './EnterPassphrase';
import HandlerClosePassphraseView from './HandlerClosePassphrase';
import HandlerFirmwareUpgradeView from './HandlerFirmwareUpgrade';
import HandlerOpenPassphraseView from './HandlerOpenPassphrase';
import RequestConfirmView from './RequestConfirm';
import RequestPassphraseOnDeviceView from './RequestPassphraseOnDevice';
import RequestPinView from './RequestPin';
import { CUSTOM_UI_RESPONSE, UI_REQUEST } from './showHardwarePopup.consts';

import type { HardwarePopup, PopupType } from './showHardwarePopup.consts';

let hardwarePopupHolder: RootSiblingsManager | null = null;
export function closeHardwarePopup() {
  if (hardwarePopupHolder) {
    hardwarePopupHolder.destroy();
    hardwarePopupHolder = null;
  }
}
let lastParams = '';
let lastCallTime = 0;
export default async function showHardwarePopup({
  uiRequest,
  payload,
  content,
}: HardwarePopup) {
  if (!uiRequest) {
    return;
  }
  const currentCallTime = Date.now();
  const currentParams = JSON.stringify({ uiRequest, payload });
  if (currentCallTime - lastCallTime < 1000 && lastParams === currentParams) {
    // ignore frequent calls
    return;
  }
  lastCallTime = currentCallTime;
  lastParams = currentParams;
  let popupType: PopupType = 'normal';
  let popupView: ReactElement | undefined;

  const { engine, serviceHardware } = backgroundApiProxy;

  const handleCancelPopup = () => {
    closeHardwarePopup();

    (async () => {
      try {
        const connectId = payload?.deviceConnectId ?? '';
        // Cancel the process
        await serviceHardware.cancel(connectId);
        // Refresh the hardware screen
        await serviceHardware.getFeatures(connectId);
      } catch (e) {
        // TODO Collect the error
      }
    })();
  };

  const { UI_RESPONSE } = await CoreSDKLoader();
  if (uiRequest === UI_REQUEST.REQUEST_PIN) {
    const deviceType = payload?.deviceType ?? 'classic';

    let onDeviceInputPin = true;
    if (payload?.deviceId) {
      try {
        const device = await engine.getHWDeviceByDeviceId(payload?.deviceId);
        onDeviceInputPin =
          device?.payload?.onDeviceInputPin ??
          !payload.supportInputPinOnSoftware;
      } catch {
        onDeviceInputPin = !payload.supportInputPinOnSoftware;
      }
    }
    popupType = onDeviceInputPin ? 'normal' : 'inputPin';

    popupView = (
      <RequestPinView
        deviceType={deviceType}
        onDeviceInput={onDeviceInputPin}
        onCancel={() => {
          handleCancelPopup();
        }}
        onConfirm={(pin) => {
          serviceHardware?.sendUiResponse({
            type: UI_RESPONSE.RECEIVE_PIN,
            payload: pin,
          });
          closeHardwarePopup();
        }}
        onDeviceInputChange={(onDeviceInput) => {
          popupType = onDeviceInputPin ? 'normal' : 'inputPin';
          if (!onDeviceInput) return;

          serviceHardware.sendUiResponse({
            type: UI_RESPONSE.RECEIVE_PIN,
            payload: '@@ONEKEY_INPUT_PIN_IN_DEVICE',
          });
        }}
      />
    );
  }

  if (uiRequest === UI_REQUEST.REQUEST_BUTTON) {
    const deviceType = payload?.deviceType ?? 'classic';

    popupView = (
      <RequestConfirmView
        deviceType={deviceType}
        bootLoader={payload?.deviceBootLoaderMode}
        onCancel={() => {
          handleCancelPopup();
        }}
      />
    );
  }

  if (uiRequest === UI_REQUEST.REQUEST_PASSPHRASE_ON_DEVICE) {
    const deviceType = payload?.deviceType ?? 'classic';

    popupView = (
      <RequestPassphraseOnDeviceView
        connectId={payload?.deviceConnectId ?? ''}
        deviceType={deviceType}
        passphraseState={payload?.passphraseState}
        onCancel={() => {
          handleCancelPopup();
        }}
      />
    );
  }

  if (uiRequest === UI_REQUEST.REQUEST_PASSPHRASE) {
    const onPassphraseAck = (
      passphraseValue: string,
      onDeviceInput = false,
    ) => {
      serviceHardware?.sendUiResponse({
        type: UI_RESPONSE.RECEIVE_PASSPHRASE,
        payload: {
          value: onDeviceInput ? '' : passphraseValue,
          passphraseOnDevice: onDeviceInput,
          save: false,
        },
      });
      closeHardwarePopup();
    };
    popupType = 'inputPassphrase';
    popupView = (
      <EnterPassphraseView
        connectId={payload?.deviceConnectId ?? ''}
        passphraseState={payload?.passphraseState}
        onConfirm={(passphrase) => onPassphraseAck(passphrase)}
        onDeviceInput={() => onPassphraseAck('', true)}
        onCancel={() => {
          handleCancelPopup();
        }}
      />
    );
  }

  if (uiRequest === CUSTOM_UI_RESPONSE.CUSTOM_NEED_UPGRADE_FIRMWARE) {
    showDialog(
      <HandlerFirmwareUpgradeView
        connectId={payload?.deviceConnectId ?? ''}
        content={content ?? ''}
        onClose={() => {
          closeHardwarePopup();
        }}
      />,
    );
    return;
  }

  if (uiRequest === CUSTOM_UI_RESPONSE.CUSTOM_NEED_CLOSE_PASSPHRASE) {
    showDialog(
      <HandlerClosePassphraseView
        deviceConnectId={payload?.deviceConnectId ?? ''}
        onClose={() => {
          closeHardwarePopup();
        }}
      />,
    );
    return;
  }

  if (uiRequest === CUSTOM_UI_RESPONSE.CUSTOM_NEED_OPEN_PASSPHRASE) {
    showDialog(
      <HandlerOpenPassphraseView
        deviceConnectId={payload?.deviceConnectId ?? ''}
        onClose={() => {
          closeHardwarePopup();
        }}
      />,
    );
    return;
  }

  if (uiRequest === CUSTOM_UI_RESPONSE.CUSTOM_NEED_ONEKEY_BRIDGE) {
    showDialog(<NeedBridgeDialog />);
    return;
  }

  if (uiRequest === CUSTOM_UI_RESPONSE.CUSTOM_FORCE_UPGRADE_FIRMWARE) {
    showDialog(
      <HandlerFirmwareUpgradeView
        connectId={payload?.deviceConnectId ?? ''}
        content={content ?? ''}
        onClose={() => {
          closeHardwarePopup();
        }}
      />,
    );
    return;
  }

  if (
    uiRequest === UI_REQUEST.LOCATION_PERMISSION ||
    uiRequest === UI_REQUEST.BLUETOOTH_PERMISSION
  ) {
    const checkPermission = () => {
      if (Platform.Version >= 31) {
        return PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        );
      }
      return PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
    };

    const check = await checkPermission();

    if (check || platformEnv.isNativeIOS) {
      showDialog(
        <PermissionDialog
          type="bluetooth"
          onClose={() => {
            getAppNavigation().goBack();
            closeHardwarePopup();
          }}
        />,
      );
      return;
    }

    const requestPermission = () => {
      if (Platform.Version >= 31) {
        return PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        );
      }
      return PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
    };

    const result = await requestPermission();

    if (
      result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
      result === PermissionsAndroid.RESULTS.DENIED
    ) {
      showDialog(
        <PermissionDialog
          type={Platform.Version >= 31 ? 'bluetooth' : 'location'}
          onClose={() => {
            getAppNavigation()?.goBack();
            closeHardwarePopup();
          }}
        />,
      );
    } else {
      closeHardwarePopup();
    }
    return;
  }

  if (uiRequest === UI_REQUEST.LOCATION_SERVICE_PERMISSION) {
    showDialog(
      <PermissionDialog
        type="locationService"
        onClose={() => {
          getAppNavigation()?.goBack();
          closeHardwarePopup();
        }}
      />,
    );
  }

  if (!popupView) {
    return setTimeout(() => {
      closeHardwarePopup();
    });
  }

  const nativeInputContentAlign = platformEnv.isNative ? 'flex-end' : 'center';
  const modalTop = platformEnv.isNativeIOS ? 42 : 10;

  setTimeout(() => {
    const modalPopup = (
      <OverlayContainer
        style={{
          // higher than react-native-modalize(9998)
          zIndex: 9999,
          flex: 1,
        }}
      >
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            flex: 1,
            // passphrase input modal should always be displayed at the top of the page
            justifyContent:
              popupType === 'normal' || popupType === 'inputPassphrase'
                ? 'flex-start'
                : nativeInputContentAlign,
            alignItems: 'center',
            padding: 0,
            margin: 0,
            top:
              popupType === 'normal' || popupType === 'inputPassphrase'
                ? modalTop
                : 0,
          }}
        >
          <CloseBackDrop backgroundColor="#00000066" />
          {popupView}
        </MotiView>
      </OverlayContainer>
    );
    if (hardwarePopupHolder) {
      hardwarePopupHolder.update(modalPopup);
    } else {
      hardwarePopupHolder = new RootSiblingsManager(modalPopup);
    }
  });

  return hardwarePopupHolder;
}
