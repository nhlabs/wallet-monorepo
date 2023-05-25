// eslint-disable-next-line import/order
import '@mywallet/shared/src/polyfills';

import type { FC } from 'react';

import { DesktopDragZoneBox } from '@mywallet/components';
import {
  DESKTOP_TOP_DRAG_BAR_HEIGHT,
  DESKTOP_TOP_DRAG_BAR_ID,
} from '@mywallet/components/src/DesktopDragZoneBox/useDesktopTopDragBarController.desktop';
import { createLazyKitProvider } from '@mywallet/kit/src/provider/createLazyKitProvider';
import '@mywallet/shared/src/web/index.css';

const KitProviderDesktop = createLazyKitProvider({
  displayName: 'KitProviderDesktop',
});

const App: FC = function () {
  global.$$onekeyPerfTrace?.log({
    name: '[DESKTOP]: App.tsx KitProviderDesktop render()',
  });

  return (
    <>
      <DesktopDragZoneBox
        nativeID={DESKTOP_TOP_DRAG_BAR_ID}
        style={{
          height: DESKTOP_TOP_DRAG_BAR_HEIGHT,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
        }}
      />
      <KitProviderDesktop />
    </>
  );
};

export default App;
