# WorldMonitor: Datenintegrations-Strategie (Phase 3)

Dieses Dokument fasst die benötigten Datenquellen zusammen, die erforderlich sind, um die analytischen Fähigkeiten des lokalen LLMs (Ollama) im WorldMonitor von reiner Geopolitik auf fundierte Finanz- und Makro-Wirtschaftsanalysen auszuweiten. Die Anforderungen basieren auf einer direkten Gap-Analyse des Modells.

> [!TIP]
> **Kostenlose Umsetzung möglich (0€ Budget):** Alle hier aufgeführten Kern-APIs lassen sich vollständig ohne laufende Kosten (Paywalls/Abos) integrieren, sofern die genannten Open-Source- oder Regierungs-Schnittstellen genutzt werden.

> [!NOTE]
> **Integration der bestehenden Infrastruktur (Status: Erfolgreich)**
> Nach detaillierter Prüfung und erfolgreichem Testlauf haben wir die Infrastruktur für Finanzdaten, die bereits nativ in der API (`server/worldmonitor/market/v1/`) existiert, als MCP-Tools registriert.
> - **MCP-Architektur-Pattern:** Anstatt neue externe Endpunkte zu bauen, hängen wir bestehende Backend-Routen (`analyze_stock`, `get_insider_transactions`) direkt in die MCP-Registry (`rpc-tools.ts`) ein. Wichtig dabei: Da es sich um bestehende Routen handelt, erwarten diese die Parameter als **HTTP GET via URL-Queries** und nicht als POST-Body. Dies stellt sicher, dass das Caching (`cachedFetchJson`) der WorldMonitor-Architektur reibungslos greift.
> - **Finnhub (Perfekt):** Das Tool `get_insider_transactions` ruft Finnhub ab. Der `FINNHUB_API_KEY` wird sicher aus der `.env.local` bezogen und das `finnhubGate` verhindert serverseitig 429-Fehler. Dies funktionierte im Test für Ollama einwandfrei.
> - **Yahoo Finance (Rate Limits):** Das Tool `analyze_stock` stützt sich für historische Daten und Analystenratings auf das `yahooGate`. Beim lokalen Testlauf via MCP hat Yahoo Finance jedoch temporär mit `429 Too Many Requests` (Rate Limit für die Entwickler-IP) reagiert. Das WorldMonitor-Backend fängt diesen Fehler sehr stabil ab und liefert eine strukturierte Fallback-Antwort (mit Preis 0), anstatt den MCP-Server abstürzen zu lassen. Das LLM erkennt diese Fallbacks und bittet den User, es später erneut zu versuchen.
> - **FRED:** Wird für die künftige Makro-Einbindung auf exakt dasselbe Gateway-Prinzip zurückgreifen.

## 1. Market Data API (Aktien, Indizes, Forex)
Um Marktbewegungen und Schocks in Echtzeit zu analysieren.
- **Benötigte Daten:** Historische und aktuelle Aktienkurse (z.B. ASML, TSMC), große Börsenindizes (NASDAQ, DAX, Nikkei) sowie Wechselkurse (Forex).
- **Ziel-Tool:** `get_market_data(symbols, timeframe)`
- **Kostenlose Provider:**
  - **Yahoo Finance API** (via `yahoo-finance2` NPM-Paket): Komplett kostenlos, extrem schnell, erfordert keinen API-Key und liefert Echtzeit- sowie historische Kurse. (Favorit)
  - **Polygon.io / Alpha Vantage**: Haben limitierte Gratis-Tiers, Yahoo Finance ist jedoch weitaus unkomplizierter für OSINT-Zwecke.

## 2. Macro-Economics API (Zinsen, Inflation, MPI)
Um die fundamentalen Treiber und das wirtschaftliche Umfeld zu verstehen.
- **Benötigte Daten:** Leitzinsen, Inflationsraten, Industrieproduktionsindizes (MPI) und globales Wirtschaftswachstum (BIP).
- **Ziel-Tool:** `get_macro_indicators(country, indicator)`
- **Kostenlose Provider:**
  - **FRED API** (Federal Reserve Economic Data): Der Goldstandard für Makro-Daten. 100% gratis, erfordert nur eine kurze Registrierung für einen API-Key.
  - **World Bank API**: Kostenlos und offen, erfordert für die meisten Endpunkte keinen API-Key.

## 3. Corporate Fundamentals & SEC Filings (Bilanzen & Lieferketten)
Um unternehmensspezifische Risiken in globalen Lieferketten (Supply Chain) bewerten zu können.
- **Benötigte Daten:** Bilanzinformationen, Auftragsbestände, Lagerbestände und offizielle Risikowarnungen der Unternehmen.
- **Ziel-Tool:** `get_company_fundamentals(ticker)` / `search_sec_filings(ticker, keyword)`
- **Kostenlose Provider:**
  - **SEC EDGAR API** (US-Börsenaufsicht): Jede an US-Börsen notierte Firma (auch internationale ADRs) muss hier Bilanzen und Quartalsberichte offenlegen. 100% gratis zugänglich, erfordert lediglich eine E-Mail-Adresse im `User-Agent`-Header, aber keinen Key.

## 4. Regulatory & Policy Feeds (Gesetze, Exportkontrollen & Zölle)
Um politische Entscheidungen schneller und präziser als herkömmliche Nachrichten zu erfassen.
- **Benötigte Daten:** Offizielle Regierungsbeschlüsse, Sanktionslisten, Exportkontrollen (z.B. Halbleiter-Bann) und Zölle.
- **Ziel-Tool:** `get_regulatory_updates(region, sector)`
- **Kostenlose Provider:**
  - **Federal Register API** (USA): Direkter, API-basierter Abgriff von offiziellen US-Regierungsdokumenten. 100% kostenlos und ohne API-Key nutzbar.
  - **RSS & OSINT-Feeds**: Gratis Pressemitteilungen der WTO (Welthandelsorganisation) oder europäischen Behörden (XML/RSS), die wir an unsere bestehende Text-Extraktions-Pipeline anbinden.
