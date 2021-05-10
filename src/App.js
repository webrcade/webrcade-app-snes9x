import {
  WebrcadeApp, 
  FetchAppData, 
  Unzip, 
  UrlUtil, 
  Resources, 
  TEXT_IDS 
} from '@webrcade/app-common'
import { Emulator } from './emulator'

import './App.scss';

class App extends WebrcadeApp {
  emulator = null;

  componentDidMount() {
    super.componentDidMount();

    // Create the emulator
    if (this.emulator === null) {
      this.emulator = new Emulator(this, this.isDebug());
    }

    const { appProps, emulator, ModeEnum } = this;

    try {
      // Get the ROM location that was specified
      const rom = appProps.rom;
      if (!rom) throw new Error("A ROM file was not specified.");
      const pal = appProps.pal !== undefined ? appProps.pal === true : null;

      throw Error("Not implemented yet");

      // // Load emscripten and the ROM
      // const uz = new Unzip();
      // emulator.loadEmscriptenModule()
      //   .then(() => new FetchAppData(rom).fetch())
      //   .then(response => response.blob())
      //   .then(blob => uz.unzip(blob, [".nes", ".fds", ".nsf", ".unf", ".nez", ".unif"]))
      //   .then(blob => new Response(blob).arrayBuffer())
      //   .then(bytes => emulator.setRom(
      //     pal,
      //     uz.getName() ? uz.getName() : UrlUtil.getFileName(rom),
      //     bytes))
      //   .then(() => this.setState({ mode: ModeEnum.LOADED }))
      //   .catch(msg => {
      //     console.error(msg); // TODO: Proper logging
      //     this.exit(Resources.getText(TEXT_IDS.ERROR_RETRIEVING_GAME));
      //   })
    } catch (e) {
      this.exit(e);
    }
  }

  async onPreExit() {
    try {
      await super.onPreExit();
      // await this.emulator.saveState();
    } catch (e) {
      // TODO: Proper logging
      console.error(e);
    }
  }

  componentDidUpdate() {
    const { mode } = this.state;
    const { ModeEnum, emulator, canvas } = this;

    // if (mode === ModeEnum.LOADED) {
    //   window.focus();
    //   // Start the emulator
    //   emulator.start(canvas);
    // }
  }

  renderCanvas() {
    return (
      <div id="screen-wrapper">
        {/* <canvas ref={canvas => { this.canvas = canvas; }} id="screen"></canvas> */}
      </div>
    );
  }

  render() {
    const { mode } = this.state;
    const { ModeEnum } = this;

    return (
      <>
        { super.render()}
        {/* { mode === ModeEnum.LOADING ? this.renderLoading() : null}
        { mode === ModeEnum.PAUSE ? this.renderPauseScreen() : null}        
        { mode === ModeEnum.LOADED || mode === ModeEnum.PAUSE  ? this.renderCanvas() : null} */}
      </>
    );
  }
}

export default App;
