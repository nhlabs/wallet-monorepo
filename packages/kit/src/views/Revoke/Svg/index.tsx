import type { FC } from 'react';

import { useTheme } from '@mywallet/components';

import SvgRevokeDark from './SvgRevokeDark';
import SvgRevokeLight from './SvgRevokeLight';

const SvgRevoke: FC = () => {
  const { themeVariant } = useTheme();
  return themeVariant === 'dark' ? <SvgRevokeDark /> : <SvgRevokeLight />;
};

export default SvgRevoke;
