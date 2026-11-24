import { Routes } from '@angular/router';
import { GameStore } from './shared/game-store';
import { unsavedChangesGuard } from './shared/unsaved.guard';

export const GAME_ROUTES: Routes = [
  { path: '', title: 'Games · Porter', loadComponent: () => import('./list/games-list').then((m) => m.GamesListPage) },
  { path: 'new', title: 'New game · Porter', data: { focus: true }, loadComponent: () => import('./create/create-game').then((m) => m.CreateGamePage) },
  {
    path: ':id',
    // One store per game, shared by all of its screens.
    providers: [GameStore],
    children: [
      { path: '', pathMatch: 'full', title: 'Game · Porter', loadComponent: () => import('./results/results').then((m) => m.GameRedirectPage) },
      { path: 'setup', title: 'Game setup · Porter', loadComponent: () => import('./setup/setup').then((m) => m.SetupPage) },
      { path: 'play', title: 'Score entry · Porter', data: { focus: true }, loadComponent: () => import('./play/play').then((m) => m.PlayPage) },
      { path: 'progress', title: 'Progress · Porter', loadComponent: () => import('./progress/progress').then((m) => m.ProgressPage) },
      { path: 'deals/:n', title: 'Deal · Porter', loadComponent: () => import('./deal/deal-detail').then((m) => m.DealDetailPage) },
      {
        path: 'deals/:n/edit',
        title: 'Edit deal · Porter',
        data: { focus: true },
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./deal/edit-deal').then((m) => m.EditDealPage),
      },
      { path: 'results', title: 'Results · Porter', loadComponent: () => import('./results/results').then((m) => m.ResultsPage) },
    ],
  },
];
