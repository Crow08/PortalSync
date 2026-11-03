import { Injectable, OnDestroy } from '@angular/core';

import { FullscreenOverlayContainer } from '@angular/cdk/overlay';

/** Applies the theme to overlays and moves them into the fullscreen element (e.g. menus of the fullscreen player). */
@Injectable({ providedIn: 'root' })
export class ThemeAwareOverlayContainer extends FullscreenOverlayContainer implements OnDestroy {
  override ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  override getContainerElement(): HTMLElement {
    this.appendTheme();
    return super.getContainerElement();
  }

  protected override _createContainer(): void {
    super._createContainer();
    this.appendTheme();
  }

  private appendTheme(): void {
    const containerElement = this._containerElement;
    if (!containerElement) {
      return;
    }
    const themeContainer = document.querySelector('#app-theme-container');
    if (!!themeContainer) {
      // the container has several classes and the theme changes: take over the theme classes only, nothing else
      containerElement.classList.forEach((name) => name.startsWith('theme-') && containerElement.classList.remove(name));
      themeContainer.classList.forEach((name) => {
        if (name === 'graphite-theme' || name.startsWith('theme-')) {
          containerElement.classList.add(name);
        }
      });
    }
  }
}
