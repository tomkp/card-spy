import { createRoot } from 'react-dom/client';
import { init } from './actions';
import { App } from './App';
import './styles.css';

void init();
createRoot(document.getElementById('root')!).render(<App />);
