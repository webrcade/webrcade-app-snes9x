import React from "react";
import { Component } from "react";

import { GamepadControlsTab, KeyboardControlsTab } from "./controls";

import {
  CustomPauseScreen,
  EditorScreen,
  GamepadWhiteImage,
  KeyboardWhiteImage,
  PauseScreenButton,
  Resources,
  TEXT_IDS,
} from '@webrcade/app-common'

export class EmulatorPauseScreen extends Component {
  constructor() {
    super();
    this.state = {
      mode: this.ModeEnum.PAUSE,
    };
  }

  ModeEnum = {
    PAUSE: "pause",
    CONTROLS: "controls",
  }

  ADDITIONAL_BUTTON_REFS = [
    React.createRef(),
  ]

  render() {
    const { ADDITIONAL_BUTTON_REFS, ModeEnum } = this;
    const { appProps, closeCallback, exitCallback, isEditor } = this.props;
    const { mode } = this.state;

    return (
      <>
        {(mode === ModeEnum.PAUSE ? (
          <CustomPauseScreen
            appProps={appProps}
            closeCallback={closeCallback}
            exitCallback={exitCallback}
            isEditor={isEditor}
            additionalButtonRefs={ADDITIONAL_BUTTON_REFS}
            additionalButtons={[
              <PauseScreenButton
                imgSrc={GamepadWhiteImage}
                buttonRef={ADDITIONAL_BUTTON_REFS[0]}
                label={Resources.getText(TEXT_IDS.VIEW_CONTROLS)}
                onHandlePad={(focusGrid, e) => focusGrid.moveFocus(e.type, ADDITIONAL_BUTTON_REFS[0])}
                onClick={() => { this.setState({ mode: ModeEnum.CONTROLS }) }}
              />
            ]}
          />
        ) : null)}
        {(mode === ModeEnum.CONTROLS ? (
          <EditorScreen
            onClose={closeCallback}
            tabs={[{
              image: GamepadWhiteImage,
              label: Resources.getText(TEXT_IDS.GAMEPAD_CONTROLS),
              content: (
                <GamepadControlsTab />
              )
            }, {
              image: KeyboardWhiteImage,
              label: Resources.getText(TEXT_IDS.KEYBOARD_CONTROLS),
              content: (
                <KeyboardControlsTab />
              )
            }]}
          />
        ) : null)}
      </>
    );
  }
}
