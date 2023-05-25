import type { FC } from 'react';

import { Box, useIsVerticalLayout } from '@mywallet/components';

export const PaddingControl: FC = ({ children }) => {
  const isSmall = useIsVerticalLayout();
  return <Box px={isSmall ? '4' : 0}>{children}</Box>;
};
