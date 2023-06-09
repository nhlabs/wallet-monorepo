import LayoutHeader from './index';

import { HStack, IconButton } from '@mywallet/components';
import { NetworkAccountSelectorTriggerMobile } from '@mywallet/kit/src/components/NetworkAccountSelector';
import WalletSelectorTrigger from '@mywallet/kit/src/components/WalletSelector/WalletSelectorTrigger/WalletSelectorTrigger';
import HomeMoreMenu from '@mywallet/kit/src/views/Overlay/HomeMoreMenu';

const headerLeft = () => <WalletSelectorTrigger />;
const headerRight = () => (
  <HStack space={3} alignItems="center">
    <NetworkAccountSelectorTriggerMobile />
    <HomeMoreMenu>
      <IconButton
        name="EllipsisVerticalOutline"
        type="plain"
        size="lg"
        circle
        m={-2}
      />
    </HomeMoreMenu>
  </HStack>
);
export function LayoutHeaderMobile() {
  return (
    <LayoutHeader
      testID="App-Layout-Header-Mobile"
      showOnDesktop={false}
      // headerLeft={() => <AccountSelector />}
      headerLeft={headerLeft}
      // headerRight={() => <ChainSelector />}
      headerRight={headerRight}
    />
  );
}
