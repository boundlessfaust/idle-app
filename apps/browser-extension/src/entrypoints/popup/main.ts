import { mount } from 'svelte';
import Popup from './Popup.svelte';
import './app.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app mount target');
const app = mount(Popup, { target });

export default app;
