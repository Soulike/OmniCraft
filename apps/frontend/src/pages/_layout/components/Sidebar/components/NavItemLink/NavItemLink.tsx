import clsx from 'clsx';
import type {LucideIcon} from 'lucide-react';
import {Link} from 'react-router';

import styles from './styles.module.css';

interface NavItemLinkProps {
  to: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
  className?: string;
}

export function NavItemLink({
  to,
  label,
  Icon,
  active,
  className,
}: NavItemLinkProps) {
  return (
    <Link
      to={to}
      className={clsx(styles.item, className)}
      data-active={active}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className={styles.icon} size={20} aria-hidden='true' />
      {label}
    </Link>
  );
}
