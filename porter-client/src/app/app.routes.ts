import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guards';
import { Shell } from './layout/shell';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

  // Public
  {
    path: '',
    canActivate: [guestGuard],
    children: [
      { path: 'login', title: 'Log in · Porter', loadComponent: () => import('./features/auth/login').then((m) => m.LoginPage) },
      { path: 'register', title: 'Create account · Porter', loadComponent: () => import('./features/auth/register').then((m) => m.RegisterPage) },
      { path: 'forgot-password', title: 'Reset password · Porter', loadComponent: () => import('./features/auth/forgot-password').then((m) => m.ForgotPasswordPage) },
    ],
  },
  { path: 'reset-password', title: 'Choose a new password · Porter', loadComponent: () => import('./features/auth/reset-password').then((m) => m.ResetPasswordPage) },

  // Authenticated app
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', title: 'Dashboard · Porter', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardPage) },
      { path: 'games', loadChildren: () => import('./features/games/games.routes').then((m) => m.GAME_ROUTES) },
      { path: 'players', loadChildren: () => import('./features/players/players.routes').then((m) => m.PLAYER_ROUTES) },
      { path: 'statistics', title: 'Statistics · Porter', loadComponent: () => import('./features/statistics/statistics').then((m) => m.StatisticsPage) },
      { path: 'profile', title: 'Profile · Porter', loadComponent: () => import('./features/account/profile').then((m) => m.ProfilePage) },
      { path: 'settings', title: 'Settings · Porter', loadComponent: () => import('./features/account/settings').then((m) => m.SettingsPage) },
      { path: '**', title: 'Not found · Porter', loadComponent: () => import('./features/errors/not-found').then((m) => m.NotFoundPage) },
    ],
  },
];
