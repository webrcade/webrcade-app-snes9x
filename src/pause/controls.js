import React from 'react';

import { ControlsTab } from '@webrcade/app-common';

export class GamepadControlsTab extends ControlsTab {
  render() {
    return (
      <>
        {this.renderControl('start', 'Start')}
        {this.renderControl('select', 'Select')}
        {this.renderControl('dpad', 'Move')}
        {this.renderControl('lanalog', 'Move')}
        {this.renderControl('b', 'A')}
        {this.renderControl('a', 'B')}
        {this.renderControl('y', 'X')}
        {this.renderControl('x', 'Y')}
        {this.renderControl('lbump', 'Left Shoulder')}
        {this.renderControl('rbump', 'Right Shoulder')}
      </>
    );
  }
}

export class KeyboardControlsTab extends ControlsTab {
  render() {
    return (
      <>
        {this.renderKey('Enter', 'Start')}
        {this.renderKey('ShiftRight', 'Select')}
        {this.renderKey('ArrowUp', 'Up')}
        {this.renderKey('ArrowDown', 'Down')}
        {this.renderKey('ArrowLeft', 'Left')}
        {this.renderKey('ArrowRight', 'Right')}
        {this.renderKey('KeyX', 'A')}
        {this.renderKey('KeyZ', 'B')}
        {this.renderKey('KeyS', 'X')}
        {this.renderKey('KeyA', 'Y')}
        {this.renderKey('KeyQ', 'Left Shoulder')}
        {this.renderKey('KeyW', 'Right Shoulder')}
      </>
    );
  }
}
