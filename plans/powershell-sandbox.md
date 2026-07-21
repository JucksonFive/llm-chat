# PowerShell-sandbox ja projektipääsy llm-chattiin

## Yhteenveto

Lisätään llm-chattiin provider-neutraali koodaustila, jossa nykyinen OpenAI-/Anthropic-/Google-/DeepSeek-/Ollama-/Bedrock-loop säilyy, mutta kaikki PowerShell- ja tiedostotoiminnot sidotaan valittuun projektiin ja suoritetaan käyttöjärjestelmän pakottamassa sandboxissa.

Toteutus noudattaa Codex-tyyppistä kaksikerroksista mallia: sandbox määrää teknisesti sallitut resurssit ja approval-policy käsittelee rajanylitykset. ([OpenAI Sandbox](https://learn.chatgpt.com/docs/sandboxing), [Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox))

## Toteutusmuutokset

### Projektit ja käyttöliittymä

- Laajenna `Project`-mallia kentillä `workspacePath`, `workspaceKind: 'windows' | 'wsl'` ja `preferredRuntime: 'windows-powershell' | 'wsl-pwsh'`.
- Lisää Electronin suojattu kansiovalitsin preload-IPC:n kautta. Renderer ei saa asettaa mielivaltaista workspace-polkua ilman käyttäjän valintaa.
- Lisää tietokantamigraatio uusille projektikentille. Vanhoissa projekteissa workspace on tyhjä ja paikalliset työkalut pysyvät pois käytöstä, kunnes kansio valitaan.
- Lisää viestikentän alle oikeusprofiili:
  - `Workspace write` oletuksena.
  - `Read only`.
  - `Full access` vain erillisellä varoituksella.
- Näytä aktiivinen työtila ja runtime ennen komennon suorittamista.

### Yhtenäinen sandbox-palvelu

Lisää serverille rajapinta:

```ts
interface SandboxExecutionRequest {
  projectId: string
  runtime: 'windows-powershell' | 'wsl-pwsh'
  script: string
  cwd?: string
  timeoutSeconds?: number
  permissions?: {
    network?: boolean
    readPaths?: string[]
    writePaths?: string[]
  }
}

interface SandboxExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
  sandbox: 'windows-elevated' | 'windows-restricted' | 'wsl-bwrap'
}
```

- Korvaa nykyinen yleinen `code_executor` erillisellä `powershell_executor`-työkalulla.
- Syötä skripti stdin-kanavan kautta `-NoLogo -NoProfile -NonInteractive`-tilassa; älä rakenna shell-komentojonoa merkkijonokonkatenoinnilla.
- Aseta oletusaikaraja 120 sekuntiin, sallittu maksimi 900 sekuntia ja stdout/stderr-raja 1 MiB.
- Poista provider-avaimet, AWS-tunnukset, SSH-agentti ja muut salaisuudet lapsiprosessin ympäristöstä.
- Käytä projektin tietokantaan tallennettua canonical-polkua. Älä luota chat-pyynnön mukana tulevaan workspace-polkuun.
- Estä symlink-, junction- ja `..`-poistuminen työtilasta. Suojaa `.git`, `.codex`, `.agents`, `.env*`, avaimet ja sovelluksen tietokanta vähintään kirjoitukselta; salaisuustiedostot myös luvulta.

### WSL-ajuri

- Tarkista käynnistyksessä WSL2, `bubblewrap` ja `pwsh`; näytä korjausohje, jos jokin puuttuu.
- Muunna Windows-polut turvallisesti `C:\code\x` → `/mnt/c/code/x`; WSL-polut käytetään canonicalisoituina.
- Rakenna `bwrap`-ympäristö, jossa:
  - projektijuuri on ainoa kirjoitettava host-polku;
  - järjestelmän binäärit ja työkaluketjut ovat vain luettavia;
  - HOME ja TEMP ovat tyhjiä väliaikaisia hakemistoja;
  - verkko on oletuksena irrotettu;
  - prosessi kuolee parent-prosessin mukana.
- Hyväksytyssä verkkosuorituksessa poistetaan vain verkkorajoitus; tiedostojärjestelmän rajat säilyvät.

### Windows-natiiviajuri

- Lisää erillinen Rust-helper, joka perustuu pinnattuun ja auditoituun osaan Apache-2.0-lisensoidusta OpenAI Codexin `windows-sandbox-rs`-toteutuksesta. Säilytä lisenssi, NOTICE ja upstream-revisio. Helper ei sisällä Codex-mallia, autentikointia tai API-avaimia. ([lähdekoodi](https://github.com/openai/codex/tree/main/codex-rs/windows-sandbox-rs), [lisenssi](https://github.com/openai/codex/blob/main/LICENSE))
- Toteuta kaksi tasoa:
  - `windows-elevated`: ensisijainen, kertaluonteinen UAC-setup, erilliset vähäoikeuksiset sandbox-käyttäjät, ACL-rajat ja käyttäjäkohtainen verkkoblokkaus.
  - `windows-restricted`: fallback ilman admin-setupia käyttäen restricted tokenia ja ACL-rajoja.
- Käytä Job Objectia koko prosessipuun aikakatkaisuun, muistirajaan ja sulkemiseen.
- Paketoi allekirjoitetut setup- ja runner-binäärit Electron-asennukseen ja tarkista niiden hash ennen käyttöä.
- Jos kumpikaan Windows-ajuri ei alustetu turvallisesti, estä native-suoritus; älä putoa suoraan käyttäjän oikeuksilla ajettavaan `powershell.exe`:en.

### Tiedostotyökalut ja hyväksynnät

- Muuta `file_reader` ja `file_writer` request-kohtaisiksi factory-työkaluiksi, jotka saavat aktiivisen projektikontekstin. Poista prosessiglobaali `WORKSPACE_ROOT` päätöksenteosta.
- Projektin sisäiset luvut, kirjoitukset sekä paikalliset build/test/git-read-komennot suoritetaan automaattisesti `workspace-write`-tilassa.
- Verkko, projektin ulkopuolinen luku, `.git`-kirjoitus ja ulkopuolinen kirjoitus tuottavat `tool-approval-request`-tapahtuman.
- Lisää tool-tilat `awaiting-approval` ja `denied`, sekä toiminnot:
  - hyväksy kerran;
  - hyväksy vastaava oikeus keskustelun loppuun;
  - hylkää.
- Toteuta AI SDK:n kaksivaiheinen approval-flow ja vastaava tila Bedrock-loopille. Hyväksyntä ei saa koskaan perustua pelkkään rendererin lähettämään boolean-arvoon: serveri sitoo approval-ID:n projektin, tool-kutsun, argumenttihashin, myönnetyt resurssit ja vanhenemisajan kanssa.
- Keskustelukohtaiset pysyvät hyväksynnät säilytetään vain muistissa ja poistetaan sovelluksen sulkeutuessa.
- Päivitä audit-loki tallentamaan runtime, canonical workspace, pyydetyt oikeudet, päätös, exit code ja aikakatkaisu. Älä tallenna kokonaisia salaisuuksia tai rajatonta komentotulostetta.

## Julkiset rajapinnat

- `POST /api/chat` saa lisäksi `projectId`- ja `permissionProfile`-kentät.
- Lisää `POST /api/tool-approvals/:approvalId`, jonka päätös on `approve-once | approve-session | deny`.
- Lisää `GET /api/sandbox/status`, joka palauttaa Windows- ja WSL-ajurien saatavuuden sekä puuttuvat esivaatimukset.
- Laajenna SSE-protokollaa tapahtumilla `tool-approval-request`, `tool-denied` ja `awaiting-approval`.
- Projektin API hyväksyy workspace-polun vain Electron-mainin allekirjoittamalla lyhytikäisellä kansiovalintatunnisteella.

## Testaus ja hyväksymiskriteerit

- Yksikkötestit polkujen canonicalisoinnille, Windows–WSL-muunnoksille, junction/symlink-escapeille, approval-hasheille ja ympäristömuuttujien suodatukselle.
- WSL-integraatiotestit varmistavat, että komento voi lukea ja muokata projektia mutta ei kotihakemistoa, SSH-avaimia, toista projektia tai verkkoa.
- Windows-integraatiotestit ajetaan sekä elevated- että restricted-ajureilla ja tarkistetaan ACL:t, verkkoblokkaus, Job Object -prosessipuun katkaisu ja cleanup.
- End-to-end-testit kattavat hyväksymisen, hylkäyksen, session-luvan, vanhentuneen approval-ID:n sekä Bedrock- ja AI SDK -provider-polut.
- Testaa `git status`, `pnpm test`, `pnpm build`, tiedoston luonti ja pitkä prosessi sekä Windows- että WSL-projekteissa.
- `pnpm build`, `pnpm lint` ja `pnpm test` läpäisevät; Windows-helperillä on erillinen Rust-testisarja ja CI-build Windows 11:llä.
- Hyväksymiskriteeri: mikään sandboxin alustusvirhe ei saa johtaa komentoon, joka ajetaan hiljaisesti normaalin käyttäjän täydellisillä oikeuksilla.

## Oletukset

- Nykyinen multi-provider-agenttiloop säilyy; OpenCodea ei oteta agenttimoottoriksi.
- Molemmat PowerShell-ajurit kuuluvat v1:een, mutta WSL-ajuri toteutetaan ensin referenssitoteutukseksi ja Windows-ajuri valmistuu ennen ominaisuuden yleistä käyttöönottoa.
- Oletustila on `workspace-write`, verkko pois ja projektin ulkopuoliset resurssit estetty.
- Yksityisten pakettirekisterien tunnusten välitys sandboxiin ei kuulu v1:een; se vaatii myöhemmin erillisen secret-brokerin.
