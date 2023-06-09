import type { FC } from 'react';

import {
  Box,
  Icon,
  Image,
  Token as TokenImage,
  Typography,
} from '@mywallet/components';
import type { Token } from '@mywallet/engine/src/types/token';

import { useNetwork } from '../../../../hooks';

type TokenDisplayProps = {
  token: Token;
};

export const TokenDisplay: FC<TokenDisplayProps> = ({ token }) => {
  const { network } = useNetwork({ networkId: token.networkId });
  return (
    <Box flexDirection="row" alignItems="center">
      <Box position="relative">
        <Box
          mr="2"
          w="8"
          h="8"
          borderRadius="full"
          overflow="hidden"
          bgColor="surface-neutral-default"
        >
          <TokenImage
            token={token}
            size={8}
            bgColor="surface-neutral-default"
          />
        </Box>
        <Box
          position="absolute"
          bottom={0}
          right="4px"
          w="18px"
          h="18px"
          bgColor="border-default"
          justifyContent="center"
          alignItems="center"
          borderRadius="full"
          overflow="hidden"
        >
          <Image size="4" src={network?.logoURI} />
        </Box>
      </Box>
      <Box flexDirection="row" alignItems="center">
        <Box>
          <Typography.DisplayLarge color="text-default" fontSize={24}>
            {token.symbol}
          </Typography.DisplayLarge>
          <Typography.Body2 color="text-subdued">
            {network?.name ?? '-'}
          </Typography.Body2>
        </Box>
        <Box ml="1">
          <Icon size={12} name="ChevronDownSolid" />
        </Box>
      </Box>
    </Box>
  );
};
