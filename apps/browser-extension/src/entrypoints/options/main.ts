import { mount } from 'svelte';
import Options from './Options.svelte';
import './app.css';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app mount target');
mount(Options, { target });
