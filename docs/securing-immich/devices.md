# Install the certificate on your devices

Each device gets its own `.pfx` file from [Client certificates](/securing-immich/client-certificates). The file holds
the private key, so move it by AirDrop, USB cable or a password manager's file attachment, not by email, and delete
the copy once it is installed. Every import asks for the password you chose when making the file.

## Immich app

The app keeps its own copy of the certificate, separate from the phone's certificate store, and can only import or
remove it before you log in.

1. Get the `.pfx` file onto the phone.
2. Open the app. On the login screen, open **Settings**, then **Advanced**.
3. Under **SSL client certificate**, tap **Import**, choose the file and enter its password.
4. Go back and log in with your Immich server address.

To remove it, log out and use the same setting. Video playback in the app does not use the certificate; the
alternative for that is a secret header under **Custom proxy headers** on the same screen. See
[Authenticating the Immich app](/securing-immich/immich-app).

## Android

For the browser only: the Immich app ignores the system store. Menu names vary a little by version and maker.

- **Stock Android:** Settings, **Security & privacy**, **More security settings**, **Encryption & credentials**,
  **Install a certificate**, **VPN & app user certificate**. Choose the file and enter its password.
- **Samsung:** Settings, **Security and privacy** (or **Biometrics and security** on older versions), **Other
  security settings**, **Install from device storage**, **VPN and app user certificate**.

Pick **VPN & app user certificate**, not **CA certificate**: the `.pfx` is your device's certificate, not an
authority's.
Chrome asks which certificate to use the first time you open Immich. To remove it, go to **User credentials** in the
same place.

## iPhone and iPad

1. Get the `.pfx` file onto the device by AirDrop, Files or a download in Safari, and open it. iOS says the profile
   was downloaded.
2. Open **Settings**. **Profile Downloaded** appears at the top; tap it, then **Install**.
3. Enter your passcode, then the certificate's password, and confirm.

Safari asks which certificate to use when you open Immich, and asks again from time to time. There is no setting to
remember the choice. To remove it, go to **Settings**, **General**, **VPN & Device Management** and delete the profile.

## Desktop browsers

| Browser | Where the certificate goes |
|---|---|
| Chrome, Edge and Safari | The operating system's store. Windows: double-click the `.pfx` and follow the import wizard for the current user. macOS: double-click it to add it to the login keychain. Linux Chrome: `chrome://settings/certificates`, **Your certificates**, **Import**. |
| Firefox | Its own store: **Settings**, **Privacy & Security**, **View Certificates**, **Your Certificates**, **Import**. |

## Check it

Open `https://immich.example.com`. The browser asks which certificate to send; choose it and the Immich login page
loads. If the browser never asks, the certificate is in the wrong store: on Android it must be under VPN and app user
certificates, and Firefox does not see the system store.
