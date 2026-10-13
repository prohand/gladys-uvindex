# UV-Index

Diese Integration verfolgt den **UV-Index** der Orte Ihrer Wahl. Sie fügen Ihre
**Gladys-Zuhause mit einem Klick** hinzu, oder einen Ort über seine
**französische Postleitzahl**, und ein Gerät erscheint im Tab **Entdecken**,
bereit, zu Gladys hinzugefügt zu werden.

Kein Konto zu erstellen, kein API-Schlüssel einzufügen: Beide Quellen sind
öffentliche Open Data.

## Ihre Gladys-Zuhause mit einem Klick hinzufügen

Sie haben Gladys bereits gesagt, wo Sie wohnen: Das ist die Karte unter
**Einstellungen > Zuhause**. Die Schaltfläche **„Meine Gladys-Zuhause
hinzufügen“** liest diese Zuhause und erstellt für jedes, das noch nicht
überwacht wird, einen Ort — ohne Postleitzahl einzugeben.

Drei Dinge sind gut zu wissen:

- **Der Zugriff ist eine Berechtigung.** Wo Sie wohnen, sind personenbezogene
  Daten: Gladys teilt sie nur, wenn Sie die Anfrage auf dem
  Installationsbildschirm der Integration akzeptiert haben. Antwortet die
  Schaltfläche, dass der Zugriff verweigert wird, entfernen Sie die Integration
  und installieren Sie sie neu, und akzeptieren Sie dabei die angezeigte Anfrage.
- **Ein Zuhause, das Sie nie auf der Karte platziert haben, hat keine
  Koordinaten.** Es wird in der Antwort genannt; verorten Sie es unter
  Einstellungen > Zuhause und führen Sie die Aktion erneut aus.
- **Das ist keine Synchronisierung.** Die Zuhause werden in dem Moment gelesen,
  in dem Sie klicken. Was dabei entsteht, ist ein gewöhnlicher Ort, der wie die
  anderen umbenannt und entfernt wird, und ein Zuhause, das danach in Gladys
  verschoben wird, verschiebt seinen Ort nicht.

Um nur eines Ihrer Zuhause hinzuzufügen — ein Ferienhaus, das Sie nicht
überwachen möchten, bleibt außen vor — wählen Sie es im Feld **Zuhause** der
Schaltfläche (Gladys 5.2 oder neuer); bleibt das Feld leer, werden alle Zuhause
hinzugefügt.

Ein erneuter Klick ist unbedenklich: Ein bereits überwachtes Zuhause wird
gemeldet, nicht ein zweites Mal hinzugefügt.

## Einen Ort hinzufügen

Klicken Sie in der Konfiguration der Integration auf **„Ort hinzufügen“** und
füllen Sie das Formular aus:

- **Name des Orts** — optional. Bleibt das Feld leer, wird der Name der
  gefundenen Gemeinde verwendet („Nantes“).
- **Postleitzahl** — fünf Ziffern, z. B. `44300`. Das ist der normale Weg.
- **Gemeinde** — optional und nur nötig, wenn eine Postleitzahl mehrere
  Gemeinden umfasst. `01000` steht für Bourg-en-Bresse, Péronnas _und_
  Saint-Denis-lès-Bourg: Führen Sie die Aktion zuerst ohne dieses Feld aus, die
  unter der Schaltfläche angezeigte Antwort listet die Kandidaten auf, und führen
  Sie sie dann mit der gemeinten Gemeinde erneut aus.
- **Breitengrad / Längengrad** — optional. Zusammen angegeben, werden sie
  unverändert verwendet, und die Postleitzahl oben wird zu einer bloßen
  Bezeichnung.

Die Meldung unter der Schaltfläche bestätigt, was hinzugefügt wurde, mit der
gefundenen Gemeinde und ihrem Punkt. **Das Gerät wird nicht automatisch
erstellt**: Holen Sie es im Tab **Entdecken** der Integration ab.

### Ein Ort außerhalb Frankreichs

Die Postleitzahl ist zwangsläufig französisch — es ist das Register des
französischen Staates, das sie auflöst. Die UV-Daten selbst sind weltweit
verfügbar: Lassen Sie für einen Ort im Ausland die Postleitzahl leer und geben
Sie **Breitengrad** und **Längengrad** in Dezimalgrad WGS-84 ein. Ein
Dezimalkomma wird akzeptiert (`48,8566`).

## Ihre Orte auflisten und entfernen

- **„Meine Orte anzeigen“** listet alles Konfigurierte nummeriert auf. Jeder
  Eintrag beginnt mit einem „•“, gefolgt von seiner Nummer.
- **„Ort entfernen“** fragt nach dieser Nummer — der, die die Liste ausgibt —
  und dann nach einer Bestätigung. Führen Sie die Aktion einmal **ohne Häkchen**
  aus, um zu prüfen, welcher Ort entfernt würde.

Zwei Dinge sind beim Entfernen gut zu wissen:

1. **Das Gladys-Gerät wird nicht gelöscht.** Eine Integration darf kein Gerät
   löschen; sie kann es nur nicht mehr anbieten. Der Ort verschwindet aus dem Tab
   „Entdecken“, und das Gerät wird nicht mehr aktualisiert — löschen Sie es
   selbst im Tab **Geräte** der Integration, wenn Sie es nicht mehr möchten. Die
   Meldung zum Entfernen nennt es Ihnen.
2. **Die folgenden Nummern rücken um eine Position auf.** Wird Ort 2 von 4
   entfernt, wird der bisherige Ort 3 zu Ort 2. Führen Sie „Meine Orte anzeigen“
   erneut aus, bevor Sie einen weiteren entfernen.

## Was jedes Gerät misst

| Funktion                  | Was sie ist                                                                      |
| ------------------------- | -------------------------------------------------------------------------------- |
| UV-Index                  | Der aktuelle Index, als ganze Zahl                                               |
| UV-Index Tagesmaximum     | Der heutige Höchstwert — die Zahl, nach der man einen Nachmittag plant           |
| UV-Index (klarer Himmel)  | Was er ohne Wolken wäre; der Abstand zum echten Index ist die Bewölkung          |
| UV-Belastungsstufe        | 0–5, die Kategorien der WHO: die Funktion, die man in einer Szene prüft          |
| UV-Belastungsstufe (Text) | Ihre Bezeichnung: „Niedrig“, „Hoch“…                                             |
| Sonnenschutz-Empfehlung   | Die Empfehlung der WHO für diese Stufe                                           |
| Daten aktualisiert am     | Die Stunde der Vorhersage, aus der die Werte stammen, in der Ortszeit des Punkts |

### Die Skala

Der **Global Solar UV Index** ist von WHO, WMO, UNEP und ICNIRP definiert. Er
ist nach oben offen, wird als ganze Zahl angegeben und nach Kategorien gelesen:

| UV-Index | Veröffentlichte Stufe | Bezeichnung | Schutz                                                  |
| -------- | --------------------- | ----------- | ------------------------------------------------------- |
| 0        | 0                     | Keine       | Keiner: keine Strahlung                                 |
| 1–2      | 1                     | Niedrig     | Kein Schutz erforderlich                                |
| 3–5      | 2                     | Mäßig       | Mittags Schatten, Hut, Sonnenbrille, Sonnencreme        |
| 6–7      | 3                     | Hoch        | Zwischen 12 und 16 Uhr die Sonne meiden                 |
| 8–10     | 4                     | Sehr hoch   | Zwischen 12 und 16 Uhr nicht hinausgehen, Haut bedecken |
| 11+      | 5                     | Extrem      | Ungeschützte Haut verbrennt in wenigen Minuten          |

Stufe **0** ist eine Ergänzung dieser Integration: Der niedrigste Bereich der
WHO, „niedrig“, umfasst 0 bis 2, aber „gerade gibt es überhaupt kein UV“
verdient in einem Zuhause einen eigenen Wert — darauf reagiert eine Szene in der
Abenddämmerung.

### Ein fehlender Wert ist nie eine Null

Hat das Modell für einen Ort keinen Wert, wird für diese Funktion **nichts
veröffentlicht**, und das Gerät behält seinen letzten bekannten Wert. Eine 0 zu
veröffentlichen sähe mitten am Nachmittag wie ein Sonnenuntergang aus und würde
die Szenen auslösen, die darauf warten.

### Wie alt sind die Daten?

**Daten aktualisiert am** ist die Stunde der CAMS-Vorhersage, aus der die Werte
des Geräts stammen, angegeben in der **Ortszeit des Punkts** — ein Ort in Sydney
und einer in Nantes zeigen nie dieselbe an, deshalb liegt sie auf jeder Station
statt auf einem eigenen Gerät.

Es ist nicht der Moment, in dem die Integration zuletzt nachgefragt hat. Die
Vorhersage hat eine stündliche Auflösung: Wird sie dreimal in einer Stunde
gelesen, liefert sie dreimal denselben Zeitstempel, und genau darum geht es: Er
sagt Ihnen, wie alt die Zahlen sind, nicht wie oft sie abgerufen wurden. Schlägt
eine Aktualisierung fehl, wird gar nichts veröffentlicht — der Zeitstempel bleibt
stehen, und das Alter wird auf dem Dashboard sichtbar.

Ein kurzer Ausfall der Quelle kostet keine ganze Aktualisierung: Die Integration
versucht es sofort erneut, zweimal, im Abstand weniger Sekunden. Bleibt die
Quelle unerreichbar, zeigen die **Widgets** und die Szenenaktion „UV-Index
lesen“ den letzten bekannten Wert — höchstens 3 Stunden alt — mit seinem eigenen
Zeitstempel, der ehrlich sagt, wie alt er ist; die Geräte erhalten nie einen
alten Wert, der als neuer ausgegeben wird.

„UV-Anbieter testen“ beendet jede Zeile mit demselben Zeitstempel, sodass eine
Quelle, die mit der Stunde von gestern antwortet, als das erscheint, was sie ist.

## Auf dem Dashboard

Im Dashboard-Editor werden zwei Widgets angeboten (Gladys 5.1 oder neuer), unter
dem Namen der Integration:

- **UV-Index eines Orts** — der aktuelle Index, das heutige Maximum und der Index
  bei klarem Himmel, **die stündliche Vorhersagekurve des Tages** mit markiertem
  Höchstwert und einer „Jetzt“-Linie, die Belastungsstufe und die zugehörige
  Empfehlung. Wählen Sie in den Widget-Einstellungen das **UV-Gerät** des
  anzuzeigenden Orts: Nur die bereits zu Gladys hinzugefügten Geräte werden
  aufgelistet.
- **UV-Index aller Orte** — eine Zeile pro Ort (höchstens 10), mit dem aktuellen
  Index und seiner Stufe, farbig. Keine Einstellungen.

Die Widgets werden in der Sprache der Person angezeigt, die sie ansieht, und
folgen jeder Aktualisierung der Integration. Wenn Sie den Ort eines Widgets
entfernen, sagt das Widget es: Wählen Sie in seinen Einstellungen ein anderes
Gerät.

## In Szenen

Die Integration fügt dem Szeneneditor zwei Karten hinzu (Gladys 5.1 oder neuer),
in der Kategorie **Integrationen**.

### Auslöser „UV-Belastungsstufe geändert“

Löst aus, wenn die Belastungsstufe eines Orts in einen anderen Bereich wechselt
(von 0 „Keine“ bis 5 „Extrem“). Drei Filter, alle optional — leer gelassen,
akzeptiert ein Filter alles:

- **Ort** — das UV-Gerät des zu überwachenden Orts;
- **Neue Stufe** — eine oder mehrere Stufen, zum Beispiel 3 und 4;
- **Richtung** — steigend oder fallend.

Die Aktionen der Szene können diese Werte weiterverwenden: den Namen des Orts,
die neue Stufe und ihre Bezeichnung, die vorherige Stufe, die Richtung (`rising`
oder `falling`), die Schutzempfehlung, den UV-Index und die Uhrzeit der Daten.
Beispielnachricht: „UV {{triggerEvent.data.level_label}} in
{{triggerEvent.data.location_name}}: {{triggerEvent.data.advice}}“.

Gut zu wissen:

- Die erste Messung nach dem Start der Integration ist ein Ausgangswert und löst
  nichts aus: Ein Neustart ist keine Veränderung am Himmel.
- Um auf einen **Schwellenwert** zu reagieren („sobald die Stufe mindestens 3
  ist“), verwenden Sie stattdessen den Standardauslöser auf der Funktion
  „UV-Belastungsstufe“ des Geräts.
- Die Texte (Bezeichnung, Empfehlung) werden in der **Sprache der Gerätenamen**
  geschrieben, die in den allgemeinen Einstellungen gewählt ist.

### Aktion „UV-Index lesen“

Liest den UV-Index eines Orts, wenn die Szene sie ausführt, und übergibt seine
Werte an die nächsten Aktionen: Name des Orts, aktueller Index, heutiges Maximum,
Index bei klarem Himmel, Stufe und Bezeichnung, Stufe und Bezeichnung des
Höchstwerts, **Uhrzeit des Höchstwerts**, Schutzempfehlung und Uhrzeit der
Daten. Ein Wert, den die Quelle nicht hat, fehlt und wird nie durch 0 ersetzt.

Beispiel: ein Auslöser „jeden Tag um 8:00“, dann „UV-Index lesen“ für Ihr
Zuhause, dann eine Nachricht „UV-Höchstwert {{0.1.uv_index_max_today}}
({{0.1.level_max_today_label}}) gegen {{0.1.peak_time}}“. Die Nummern (`0.1`)
sind die der Aktion in Ihrer Szene: Der Editor schlägt sie vor.

## Allgemeine Einstellungen

- **Sprache der Gerätenamen** — alles andere, was diese Integration sagt, folgt
  bereits Ihrer Gladys-Sprache, aber ein Gerätename und die Namen seiner
  Funktionen werden so gespeichert, wie sie im Moment der Erstellung des Geräts
  sind. Ein bereits hinzugefügtes Gerät **behält** die Namen, mit denen es
  erstellt wurde: Ändern Sie die Sprache, löschen Sie dann das Gerät und fügen
  Sie es über den Tab „Entdecken“ erneut hinzu, um es umzubenennen. Die Texte, die
  an Ihre Szenen übergeben werden (Bezeichnung der Stufe, Empfehlung), folgen
  ebenfalls dieser Einstellung. Zur Auswahl stehen Französisch (Standard),
  Englisch, Deutsch und Spanisch.
- **Aktualisierungsintervall** — standardmäßig 30 Minuten, zwischen 10 Minuten
  und 6 Stunden. Die CAMS-Vorhersage ist stündlich: Deutlich unter einer halben
  Stunde zu gehen, bringt nichts. Alle Orte werden in einer einzigen Anfrage
  gelesen, und ein Wert wird nur einmal pro Stunde abgefragt, wie viele
  Aktualisierungen und Widgets es auch gibt.

## Prüfen, ob es funktioniert

Die Schaltfläche **„UV-Anbieter testen“** fragt die Quelle für jeden Ort live ab
und zeigt den erhaltenen Index an, im selben nummerierten Format wie die Liste
der Orte. Schlägt ein Ort fehl, sagt seine Zeile warum, und die anderen antworten
trotzdem. Ein Ort, für den die Quelle keinen Wert hat, zeigt „keine Daten“, nie
eine Stufe. Anders als die Widgets zeigt diese Schaltfläche nie einen alten Wert:
Eine ausgefallene Quelle erscheint als ausgefallen.

Der Bildschirm **Überwachung** zeigt außerdem den Status der Integration: Solange
kein Ort konfiguriert ist, sagt er, dass einer hinzugefügt werden muss.

## Woher die Daten kommen

- **Der UV-Index**: der europäische Dienst [Copernicus
  CAMS](https://atmosphere.copernicus.eu/), der die biologisch wirksame UV-Dosis
  aus der Gesamtozonsäule, den Aerosolen und der Bewölkung berechnet. Seine
  Vorhersage wird von
  [Open-Meteo](https://open-meteo.com/en/docs/air-quality-api) (CC BY 4.0) als
  Open Data bereitgestellt, ohne Konto und ohne Schlüssel. Weltweite Abdeckung,
  stündliche Auflösung, Raster von ~45 km.
- **Die Postleitzahlen**: die [API Découpage
  administratif](https://geo.api.gouv.fr/decoupage-administratif/communes) des
  französischen Staates, veröffentlicht auf data.gouv.fr aus der
  Verwaltungsdatenbank des INSEE. Sie liefert die Gemeinden, die eine
  Postleitzahl umfasst, und ihren Mittelpunkt.

Météo-France veröffentlicht ebenfalls eine französische UV-Vorhersage, aber sein
Portal verlangt ein Konto und ein Anwendungstoken, das jede Person erst
erstellen müsste, bevor die Integration überhaupt etwas anzeigt. Copernicus ist
genauso offiziell und verlangt nichts.
