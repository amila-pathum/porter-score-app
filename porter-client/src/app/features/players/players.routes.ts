import { Routes } from '@angular/router';

export const PLAYER_ROUTES: Routes = [
  { path: '', title: 'Players · Porter', loadComponent: () => import('./players').then((m) => m.PlayersPage) },
  { path: 'new', title: 'New player · Porter', data: { openNew: true }, loadComponent: () => import('./players').then((m) => m.PlayersPage) },
  { path: ':id', title: 'Player · Porter', loadComponent: () => import('./players').then((m) => m.PlayerProfilePage) },
];
