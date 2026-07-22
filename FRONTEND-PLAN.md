Toimi kokeneena käyttöliittymäkehittäjänä, mobiili-UI-suunnittelijana ja design system -asiantuntijana.

## Lähtötilanne

Sovellus on jo teknisesti valmis ja toimiva. Navigaatio, näkymät, tilanhallinta, data, API-yhteydet ja sovelluslogiikka ovat olemassa.

Älä rakenna sovellusta uudelleen.

Tehtäväsi on viimeistellä nykyinen käyttöliittymä visuaalisesti erittäin korkealaatuiseksi ja tehdä siitä ChatGPT:n natiivisovelluksen kaltainen käyttökokemus rakenteen, tilankäytön, navigaation, sivupalkin ja animaatioiden osalta.

Älä käytä OpenAI:n logoja, nimiä, kuvakkeita tai muita suojattuja brändielementtejä.

## Päätavoite

Paranna olemassa olevaa frontendiä niin, että sovellus tuntuu:

* modernilta
* minimalistiselta
* yhtenäiseltä
* viimeistellyltä
* natiivilta
* nopealta
* rauhalliselta
* tuotantovalmiilta

Tärkein painopiste on navigaatiossa ja sivupalkissa.

## Työskentelytapa

Tutki ensin nykyinen koodipohja.

Tunnista:

* nykyinen komponenttirakenne
* navigaatiorakenne
* käytössä olevat UI-komponentit
* teema- ja väriasetukset
* sivupalkin nykyinen toteutus
* animaatiot
* spacing-arvot
* typografia
* toistuva tyylikoodi
* visuaaliset epäjohdonmukaisuudet
* käyttöliittymän kohdat, jotka tuntuvat geneerisiltä tai keskeneräisiltä

Älä muuta toimivaa liiketoimintalogiikkaa, API-kutsuja, tietomalleja tai navigaation käyttäytymistä ilman selkeää tarvetta.

Suosi pieniä, hallittuja ja helposti arvioitavia muutoksia.

## Visuaalinen suunta

Viimeistele käyttöliittymä ChatGPT-tyyliseksi ilman suoraa brändikopiointia.

Käytä:

* lähes mustaa tai pehmeän tummaa taustaa
* hillittyjä harmaan sävyjä
* erittäin hienovaraisia reunaviivoja
* maltillisia varjoja
* tarkkaan määriteltyjä spacing-arvoja
* pehmeitä kulmanpyöristyksiä
* selkeää typografista hierarkiaa
* rauhallisia animaatioita
* yhtenäisiä hover-, press-, focus- ja disabled-tiloja
* riittävän suuria kosketusalueita

Vältä:

* liian vahvoja gradientteja
* raskaita varjoja
* liian pyöreitä komponentteja
* kirkkaanvärisiä korostuksia
* geneeristä chatbot-estetiikkaa
* turhaa visuaalista melua
* epäjohdonmukaisia marginaaleja ja padding-arvoja

## Sivupalkin viimeistely

Sivupalkki on tärkein yksittäinen viimeisteltävä alue.

Paranna sen:

* leveyttä
* hierarkiaa
* spacingia
* keskustelulistan luettavuutta
* aktiivisen keskustelun korostusta
* hakukenttää
* uuden keskustelun painiketta
* profiiliosiota
* asetusten sijoittelua
* pitkien otsikoiden käsittelyä
* keskusteluryhmien otsikoita
* overlayta
* avaamis- ja sulkemisanimaatiota
* pyyhkäisyeleitä
* kosketuspalautetta
* safe area -käyttäytymistä

Tavoitteena on, että sivupalkki tuntuu natiivilta mobiilipaneelilta eikä tavalliselta verkkosivun drawer-komponentilta.

Sivupalkin tulee:

* avautua pehmeästi vasemmalta
* seurata käyttäjän sormea pyyhkäisyn aikana
* sulkeutua overlayta painamalla
* sulkeutua takaisin pyyhkäisemällä
* käyttää luonnollista easingia
* tummentaa tausta asteittain
* säilyttää korkea suorituskyky

## Navigaation viimeistely

Paranna navigaation visuaalista ja toiminnallista jatkuvuutta.

Tarkista erityisesti:

* yläpalkkien korkeus
* kuvakkeiden koko
* painikkeiden kosketusalueet
* otsikoiden kohdistus
* näkymien väliset siirtymät
* takaisin-painikkeet
* aktiiviset tilat
* modal- ja sheet-näkymät
* näppäimistön käyttäytyminen
* safe area -alueet

Navigaation tulee tuntua yhtenäiseltä koko sovelluksessa.

## Keskustelunäkymän viimeistely

Paranna nykyistä keskustelunäkymää muuttamatta sen logiikkaa.

Kiinnitä huomiota:

* viestialueen maksimaaliseen luettavuuteen
* tekstin riviväliin
* viestien pystysuuntaiseen rytmiin
* käyttäjän ja avustajan viestien erotteluun
* koodilohkoihin
* listauksiin
* lainauksiin
* linkkeihin
* kopiointipainikkeisiin
* lataus- ja kirjoitusindikaattoreihin
* tyhjän keskustelun näkymään
* virhetiloihin
* suoratoistettavan tekstin käyttäytymiseen

Älä käytä raskaita chat-kuplia, ellei nykyinen design niitä edellytä. Suosi puhdasta, sisältökeskeistä esitystapaa.

## Viestikentän viimeistely

Paranna composer-komponenttia niin, että se tuntuu sovelluksen tärkeimmältä interaktiiviselta elementiltä.

Tarkista:

* tekstikentän padding
* automaattisesti kasvava korkeus
* minimikorkeus
* maksimikorkeus
* lähetyspainikkeen aktiivinen tila
* disabled-tila
* liitepainike
* äänisyötepainike
* näppäimistön välttäminen
* alareunan safe area
* focus-tila
* painalluspalaute
* placeholder-tekstin kontrasti

Kentän tulee näyttää kevyeltä mutta selkeästi interaktiiviselta.

## Design system

Luo tai yhtenäistä olemassa oleva design token -järjestelmä.

Määrittele vähintään:

* background-värit
* surface-värit
* border-värit
* primary- ja secondary-tekstit
* muted-tekstit
* accent-väri
* error-väri
* success-väri
* spacing-asteikko
* border radius -asteikko
* fonttikoot
* fonttipaksuudet
* rivivälit
* icon-koot
* animaatioiden kestot
* easing-arvot

Vaihda hajallaan olevat hardcoded-arvot yhteisiin tokeneihin siellä, missä se parantaa johdonmukaisuutta.

Älä tee tarpeettoman suurta refaktorointia.

## Animaatiot

Käytä animaatioita vain silloin, kun ne parantavat ymmärrettävyyttä tai tuntumaa.

Viimeistele erityisesti:

* sivupalkin avautuminen
* overlayn opacity
* painikkeiden press-tila
* aktiivisen keskustelun vaihtuminen
* modalien avautuminen
* syöttökentän korkeuden muuttuminen
* latausindikaattorit
* listan itemien ilmestyminen
* teeman vaihto

Animaatioiden tulee olla nopeita, hillittyjä ja luonnollisia.

Huomioi reduced motion -asetus.

## Saavutettavuus

Varmista:

* vähintään 44 × 44 pisteen kosketusalueet
* riittävä kontrasti
* accessibilityLabel-arvot
* accessibilityRole-arvot
* selkeä focus-järjestys
* fonttien skaalautuminen
* screen reader -yhteensopivuus
* reduced motion
* väristä riippumattomat aktiiviset tilat

## Tekninen rajaus

Älä:

* vaihda sovelluksen nykyistä arkkitehtuuria ilman pakottavaa syytä
* korvaa toimivaa navigaatiota kokonaan
* muuta API-rajapintoja
* muuta tietomalleja
* lisää raskasta UI-kirjastoa vain ulkoasun vuoksi
* kirjoita koko sovellusta uudelleen
* poista olemassa olevia toimintoja

Säilytä nykyiset riippuvuudet aina kun mahdollista.

## Odotettu lopputulos

Palauta työ seuraavassa muodossa:

1. Lyhyt UI-audit nykyisestä toteutuksesta
2. Lista tärkeimmistä visuaalisista ongelmista
3. Priorisoitu viimeistelysuunnitelma
4. Muokattavat tiedostot
5. Täydelliset koodimuutokset tiedostoittain
6. Design token -muutokset
7. Sivupalkin ja navigaation parannukset
8. Keskustelunäkymän parannukset
9. Ennen–jälkeen-yhteenveto
10. Tarkistuslista käyttöliittymän testaamiseen

Kirjoita suoraan toimivaa koodia. Älä käytä pseudokoodia.

Kun muokkaat tiedostoa, näytä koko relevantti komponentti tai selkeä diff. Älä jätä toteutusta pelkkien ehdotusten tasolle.

Aloita analysoimalla nykyinen koodipohja. Tee sen jälkeen ensin sivupalkin ja navigaation viimeistely, sitten keskustelunäkymä, viestikenttä ja lopuksi yleinen design system -siivous.
