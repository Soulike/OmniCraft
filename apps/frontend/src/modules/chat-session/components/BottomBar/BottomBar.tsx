import {InfoBar} from '../InfoBar/index.js';
import styles from './styles.module.css';

export function BottomBar() {
  return (
    <div className={styles.container}>
      <InfoBar />
    </div>
  );
}
