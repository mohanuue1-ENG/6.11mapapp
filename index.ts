import { registerRootComponent } from 'expo';
// Must be imported at the top level: the background location task has to be
// registered before React renders, or the OS cannot wake it when the app is closed.
import './src/location';
import App from './App';

registerRootComponent(App);
