// Custom entry (B22): the background location task must be defined before
// anything else runs, because the OS may start the app in the background
// (also after it was closed) only to deliver locations, and then no screen or
// layout is rendered. See the expo-task-manager and expo-router docs.
import './src/lib/background-location';
import 'expo-router/entry';
