import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: false,
  template: `
    <div class="app-container">
      <header class="app-header">
        <h1>{{ title }}</h1>
        <p class="subtitle">{{ subtitle }}</p>
      </header>

      <main class="app-content">
        <section class="card">
          <h2>Dashboard Overview</h2>
          <p>This Angular SPA fixture contains multiple components with realistic DOM structure to test web-clone SPA crawling capabilities. The production build includes _nghost and _ngcontent attributes.</p>
          <div class="stats-grid">
            <div class="stat-item" *ngFor="let stat of stats">
              <span class="stat-value">{{ stat.value }}</span>
              <span class="stat-label">{{ stat.label }}</span>
            </div>
          </div>
        </section>

        <section class="card">
          <h2>{{ featuresTitle }}</h2>
          <ul class="feature-list">
            <li *ngFor="let feature of features">
              <span class="feature-icon">&#10003;</span>
              {{ feature }}
            </li>
          </ul>
        </section>

        <section class="card image-section">
          <h2>Resources</h2>
          <div class="image-grid">
            <img
              *ngFor="let img of images; let i = index"
              [src]="img"
              [alt]="'Placeholder ' + (i + 1)"
              class="placeholder-img"
            />
          </div>
        </section>
      </main>

      <footer class="app-footer">
        <p>&copy; {{ year }} Angular E2E Fixture. This page is designed to test web-clone SPA snapshot capabilities.</p>
      </footer>
    </div>
  `,
  styles: [`
    .app-container { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
    .app-header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #e0e0e0; padding-bottom: 20px; }
    .app-header h1 { color: #dd0031; font-size: 28px; }
    .subtitle { color: #666; font-size: 16px; }
    .card { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .card h2 { color: #1976d2; margin-top: 0; }
    .stats-grid { display: flex; gap: 15px; margin-top: 15px; flex-wrap: wrap; }
    .stat-item { background: #f5f5f5; border-radius: 6px; padding: 12px 20px; text-align: center; min-width: 100px; }
    .stat-value { display: block; font-size: 24px; font-weight: bold; color: #dd0031; }
    .stat-label { display: block; font-size: 12px; color: #666; margin-top: 4px; }
    .feature-list { list-style: none; padding: 0; }
    .feature-list li { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .feature-icon { color: #4caf50; margin-right: 8px; }
    .image-grid { display: flex; gap: 15px; flex-wrap: wrap; margin-top: 15px; }
    .placeholder-img { width: 180px; height: 120px; object-fit: contain; border: 1px solid #e0e0e0; border-radius: 4px; }
    .app-footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #999; font-size: 13px; }
  `],
})
export class AppComponent {
  title = 'Angular SPA Application';
  subtitle = 'End-to-End Test Fixture for Web-Clone';
  featuresTitle = 'Key Features';
  year = new Date().getFullYear();

  stats = [
    { label: 'Components', value: '5' },
    { label: 'Elements', value: '30+' },
    { label: 'Images', value: '3' },
    { label: 'Sections', value: '3' },
  ];

  features = [
    'Server-side framework detection via _nghost attributes',
    'Client-side hydration with Angular zone.js',
    'CSS styling with inline component styles',
    'Image resources for sub-resource download testing',
    'Multiple component sections with varied DOM structure',
  ];

  images = ['/assets/placeholder-1.svg', '/assets/placeholder-2.svg', '/assets/placeholder-3.svg'];
}
