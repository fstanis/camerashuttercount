import { render } from 'preact';
import { useState } from 'preact/hooks';
import { getCameraInfo, type CameraInfo } from './camera.ts';

type Status = 'idle' | 'loading' | 'success' | 'error';

function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [cameraInfo, setCameraInfo] = useState<CameraInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGetInfo = async () => {
    setStatus('loading');
    setError(null);
    setCameraInfo(null);

    try {
      const info = await getCameraInfo();
      setCameraInfo(info);
      setStatus('success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setStatus('error');
    }
  };

  return (
    <>
      <header>
        <nav>
          <a href="https://github.com/fstanis/camerashuttercount">
            <svg class="icon" viewBox="0 0 32 32">
              <path d="M16 0.395c-8.836 0-16 7.163-16 16 0 7.069 4.585 13.067 10.942 15.182 0.8 0.148 1.094-0.347 1.094-0.77 0-0.381-0.015-1.642-0.022-2.979-4.452 0.968-5.391-1.888-5.391-1.888-0.728-1.849-1.776-2.341-1.776-2.341-1.452-0.993 0.11-0.973 0.11-0.973 1.606 0.113 2.452 1.649 2.452 1.649 1.427 2.446 3.743 1.739 4.656 1.33 0.143-1.034 0.558-1.74 1.016-2.14-3.554-0.404-7.29-1.777-7.29-7.907 0-1.747 0.625-3.174 1.649-4.295-0.166-0.403-0.714-2.030 0.155-4.234 0 0 1.344-0.43 4.401 1.64 1.276-0.355 2.645-0.532 4.005-0.539 1.359 0.006 2.729 0.184 4.008 0.539 3.054-2.070 4.395-1.64 4.395-1.64 0.871 2.204 0.323 3.831 0.157 4.234 1.026 1.12 1.647 2.548 1.647 4.295 0 6.145-3.743 7.498-7.306 7.895 0.574 0.497 1.085 1.47 1.085 2.963 0 2.141-0.019 3.864-0.019 4.391 0 0.426 0.288 0.925 1.099 0.768 6.354-2.118 10.933-8.113 10.933-15.18 0-8.837-7.164-16-16-16z"></path>
            </svg>
            View source code
          </a>
        </nav>

        <h1>Camera Shutter Count</h1>
        <p>Check your camera's shutter count directly in your browser</p>
      </header>

      <main>
        <section>
          <h2>Get Started</h2>
          <p>
            Connect your camera via USB and click the button below to read the
            shutter count. Make sure your camera is in{' '}
            <strong>PTP/PC Connect mode</strong> (not Mass Storage).
          </p>
          <button onClick={handleGetInfo} disabled={status === 'loading'}>
            {status === 'loading' ? 'Reading...' : 'Get Camera Info'}
          </button>
        </section>

        {status === 'error' && error && (
          <p class="notice">
            <strong>Error:</strong> {error}
          </p>
        )}

        {status === 'success' && cameraInfo && (
          <section>
            <h2>Camera Information</h2>
            <table>
              <tbody>
                <tr>
                  <th>Manufacturer</th>
                  <td>{cameraInfo.manufacturer}</td>
                </tr>
                <tr>
                  <th>Model</th>
                  <td>{cameraInfo.model}</td>
                </tr>
                <tr>
                  <th>Firmware Version</th>
                  <td>{cameraInfo.version}</td>
                </tr>
                <tr>
                  <th>Serial Number</th>
                  <td>{cameraInfo.serial}</td>
                </tr>
                <tr>
                  <th>Shutter Count</th>
                  <td>
                    {cameraInfo.shutterCount >= 0 ? (
                      <mark>{cameraInfo.shutterCount.toLocaleString()}</mark>
                    ) : (
                      <em>Not available for this camera</em>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        <section>
          <h2>Usage Instructions</h2>
          <ol>
            <li>
              <strong>Set your camera to PTP mode:</strong> Go to your camera's
              settings and change the USB connection mode from "Mass Storage" to
              "PTP" or "PC Connect" mode.
            </li>
            <li>
              <strong>Connect via USB:</strong> Use a USB cable to connect your
              camera to your computer.
            </li>
            <li>
              <strong>Turn on your camera:</strong> Make sure your camera is
              powered on.
            </li>
            <li>
              <strong>Click "Get Camera Info":</strong> Your browser will prompt
              you to select the camera device.
            </li>
            <li>
              <strong>Grant permission:</strong> Allow the browser to access
              your camera when prompted.
            </li>
          </ol>
        </section>

        <section>
          <h2>Supported Cameras</h2>
          <p>
            Shutter count reading is currently supported for{' '}
            <strong>Canon EOS</strong> and <strong>Fujifilm</strong> cameras.
            Other cameras may connect but won't report shutter count.
          </p>
          <p class="notice">
            <strong>⚠️ Disclaimer:</strong> The list of supported cameras below
            is based on the libgphoto2 library and has not been individually
            verified. Your camera may or may not work. If you find that your
            camera is not supported or works differently than expected, please{' '}
            <a
              href="https://github.com/fstanis/camerashuttercount/issues"
              target="_blank"
              rel="noopener"
            >
              report it on GitHub
            </a>
            .
          </p>
          <h3>Canon EOS Cameras</h3>
          <ul>
            <li>
              EOS R Series: R, RP, R3, R5, R5 C, R6, R6 Mark II, R6 Mark III,
              R7, R8, R10, R50, R100, R1
            </li>
            <li>
              EOS 1D Series: 1D X, 1D X Mark II, 1D X Mark III, 1D C, 1D Mark
              II, 1D Mark III, 1D Mark IV
            </li>
            <li>
              EOS 5D Series: 5D, 5D Mark II, 5D Mark III, 5D Mark IV, 5DS, 5DS
              R, 5R Mark II
            </li>
            <li>EOS 6D Series: 6D, 6D Mark II</li>
            <li>EOS 7D Series: 7D, 7D Mark II</li>
            <li>
              EOS xxD Series: 10D, 20D, 30D, 40D, 50D, 60D, 70D, 77D, 80D, 90D
            </li>
            <li>
              EOS xxxD/Rebel Series: 100D, 200D, 250D, 300D, 350D, 400D, 450D,
              500D, 550D, 600D, 650D, 700D, 750D, 760D, 800D, 850D, 1000D,
              1100D, 1200D, 1300D, 2000D, 3000D, 4000D
            </li>
            <li>
              EOS M Series: M, M2, M3, M5, M6, M6 Mark II, M10, M50, M50 Mark
              II, M100, M200
            </li>
          </ul>
          <h3>Fujifilm Cameras</h3>
          <ul>
            <li>
              X-T Series: X-T1, X-T2, X-T3, X-T4, X-T5, X-T10, X-T20, X-T30
            </li>
            <li>X-Pro Series: X-Pro2, X-Pro3</li>
            <li>X-H Series: X-H1, X-H2, X-H2S</li>
            <li>X-E Series: X-E1, X-E2, X-E3, X-E4, X-E5</li>
            <li>X-S Series: X-S1, X-S10</li>
            <li>X-A Series: X-A2, X-A5</li>
            <li>X-M Series: X-M1, X-M5</li>
            <li>X100 Series: X100F, X100V, X100VI</li>
            <li>GFX Series: GFX 50S, GFX 50R, GFX 100, GFX 100S, GFX 100 II</li>
            <li>Other: X10, X20, X30, X70</li>
          </ul>
        </section>
      </main>

      <footer>
        Created by{' '}
        <a href="https://github.com/fstanis" target="_blank" rel="noopener">
          {' '}
          Filip Stanis
        </a>{' '}
        and licensed under GPLv3.
        <br />
        Inspired by{' '}
        <a
          href="https://orlv.github.io/freeshuttercounter/"
          target="_blank"
          rel="noopener"
        >
          Free Shutter Counter
        </a>{' '}
        with code directly adapted from the{' '}
        <a href="http://www.gphoto.org" target="_blank" rel="noopener">
          libgphoto2
        </a>{' '}
        library.
        <p class="disclaimer">In no event unless required by applicable law or agreed to in writing will any copyright holder, or any other party who modifies and/or conveys the program as permitted above, be liable to you for damages, including any general, special, incidental or consequential damages arising out of the use or inability to use the program (including but not limited to loss of data or data being rendered inaccurate or losses sustained by you or third parties or a failure of the program to operate with any other programs), even if such holder or other party has been advised of the possibility of such damages.</p>
      </footer>
    </>
  );
}

render(<App />, document.getElementById('app')!);
