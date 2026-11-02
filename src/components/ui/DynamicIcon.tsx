// ============================================================
// Dynamic Lucide icon component
// ============================================================
import type { FC } from 'react';
import * as icons from 'lucide-react';
import type { LucideProps } from 'lucide-react';

interface DynamicIconProps extends LucideProps {
  name: string;
}

const DynamicIcon: FC<DynamicIconProps> = ({ name, ...props }) => {
  const IconComponent = (icons as unknown as Record<string, FC<LucideProps>>)[name];
  if (!IconComponent) {
    const Fallback = icons.HelpCircle;
    return <Fallback {...props} />;
  }
  return <IconComponent {...props} />;
};

export default DynamicIcon;
