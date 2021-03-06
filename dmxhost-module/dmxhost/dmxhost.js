/**
 * dmxhost erlaubt mit passenden Arduino- und Python-Programmen
 * das Steuern von DMX-Geräten unter Linux mit node.js
 * 
 * Über das Partnerskript dmxhost-serial-relay.py wird ein per USB
 * angeschlossener Arduino als serielles TTY-Gerät angesprochen. Das
 * Skript wird als Relay und erspart node.js den Umgang mit binären
 * Daten. Dieses node.js-Modul ist exakt auf das Verhalten des Relays
 * und des Arduinos zugeschnitten.
 * 
 * Das Modul ist passiv und wartet, bis eine Funktion aufgerufen wird.
 * Per Voreinstellung wird nichts auf die Standardausgabe geschrieben.
 * Es werden keine Exceptions geworfen.
 * 
 * dmxhost
 *   .device: TTY-Gerätename, wird an Relay übergeben
 *   .baud: Baudrate des TTYs, wird an Relay übergeben
 *   .relayPath: Pfad zum Relay
 *   .relayResponseTimeout: maximale Zeit ohne Antwort von Relay
 *   .keepAlive: Relay neu starten, wenn unerwartet beendet?
 *   .keepAliveDelay: Wartezeit vor Neustarts
 *   .log: auf true setzen, um Informationen zur Ausführung zu erhalten
 *   .logger: Funktion zum Protokollieren (nutzt per Vorgabe util.log)
 * 
 * dmxhost.spawn(options, callback)
 *   startet Relay-Skript und richtet Kommunikation ein
 *   options: (Platzhalter)
 *   callback: function(error)
 * 
 * dmxhost.ready()
 *   gibt true zurück, wenn dmxhost bereit zum Senden ist (sonst false)
 *   (nur notwendig wenn kein callback an .spawn() übergeben wurde)
 * 
 * dmxhost.send(options, callback)
 *   übergibt ein Array von Zahlen (0..255) an Relay, das aus jeder Zahl
 *   ein Binärzeichen macht und 1:1 an das TTY übergibt
 *   options.data: numerisches Array zu sendender Daten
 *   callback: function(error, sentBytes)
 *     sentBytes: Anzahl übertragener Bytes (= DMX-Kanäle)
 * 
 * dmxhost.quit(options, callback)
 *   beendet Relay-Skript
 *   options.respawn: zum anschließenden Neustarten auf true setzen
 *   callback: function(error)
 * 
 * error:
 *   im Fehlerfall ein Objekt der Form {code, message, ...}
 *   im Erfolgsfall null
 * 
 * Tritt beim erstmaligen Start des Relays ein Fehler auf, wird dieser
 * an die callback-Funktion zurückgegeben. Stürzt das Relay nach dem
 * Start während regulärer Benutzung ab, wird es (wenn .keepAlive true
 * ist) automatisch neu gestartet.
 * 
 * Treten andere Fehler auf, zum Beispiel beim Senden, werden diese der
 * callback-Funktion mitgeteilt ohne das Relay neu zu starten. Es ist
 * denkbar, einen weiteren Sendeversuch zu vagen oder das Relay neu zu
 * starten. Das bleibt dem Nutzer überlassen. Ein Neustart kann
 * jederzeit mit .quit({respawn:true}) ausgeführt werden.
 * 
 * nick@bitfasching.de
 * v0.1.0, 01/2015
 */


'use strict';


(function(){
    
    /* :: Basis :: */
    
    
    // Selbstreferenz
    var dmxhost;
    
    // Abhängigkeiten
    var child = require('child_process');
    var util  = require('util');
    
    // Prozessreferenz für Relay auf seriellen DMX-Controller
    var relayProcess = null;
    
    // zeigt, ob Relay schon läuft und bereit ist
    var relayReady = false;
    
    // Fehlerstatus
    var relayFailed = false;
    
    // aktueller Callback für Nachrichten von Relay
    var relayMessageCallback = function() {};
    
    
    
    
    /* :: Modulschnittstelle :: */
    
    
    module.exports = dmxhost = {
        
        // Gerätename
        device: '/dev/ttyACM0',
        
        // Baudrate
        baud: 115200,

		
        // Pfad zum Relay (muss ausführbar sein)
        relayPath: './dmxhost-serial-relay.py', 
		
        // Zeit [ms], die auf Antwort des Relays gewartet wird,
        // bevor die Aktion mit einem Fehler abgebrochen wird
        relayResponseTimeout: 500,
        
        // Relay bei Problemen automatisch neu starten?
        keepAlive: true,
        
        // Wartezeit vor automatischen Neustarts [ms]
        keepAliveDelay: 1000,
        
        // Meldungen auf .logger() ausgeben?
        log: false,
        
        // Funktion zum Protokollieren
        logger: function( message ) { util.log( "[dmxhost] " + message ); },
        
    };
 
    
    /* :: öffentliche Funktionen :: */
    
    
    // Relay starten
    dmxhost.spawn = function spawn( options, callback )
    {
        // Prozess noch nicht gestartet
        if ( !relayProcess )
        {
            // yay, es geht los
            this.log && this.logger( "[i] Spawn relay..." );
            
            // Prozess starten
			if(/^win/.test(process.platform)){
				relayProcess = child.spawn( "python", [this.relayPath, this.device, this.baud] ); // Windows version
			} else {
				relayProcess = child.spawn( this.relayPath, [this.device, this.baud] ); // Linux version
			}
			
            
			
            this.log && this.logger( "[i] Relay started with PID " + relayProcess.pid + "." );
            
            // Fehlerstatus zurücksetzen
            relayFailed = false;
            
            // Zeichenkodierung für Ein- & Ausgabe einstellen
            relayProcess.stdout.setEncoding( 'utf8' );
            
            // Variablen, um Nachrichtenfragmente von Relay zu sammeln
            var stdinCache  = '';
            var stderrCache = '';
            
            // Standardausgabe von Relay auffangen und verarbeiten
            relayProcess.stdout.on( 'data', function( data )
            {
                // Fragment mitschreiben
                stdinCache += data;
                
                // Zeilenende empfangen?
                if ( data.slice(-1) == "\n" )
                {
                    // umgebende Leerzeichen entfernen und Nachricht an aktuellen Callback weiterleiten
                    relayMessageCallback && relayMessageCallback( stdinCache.trim() );
                    
                    // Fragment-Cache leeren
                    stdinCache = '';
                }
            });
            
            // Fehlerausgabe auch mitschneiden
            relayProcess.stderr.on( 'data', function( data ) { stderrCache += data; } );
            
            // auf "ready"-Nachricht von Relay warten
            relayMessageCallback = function waitForReadyMessage( message )
            {
                // bereit?
                if ( message == 'ready' )
                {
                    // jep, Status setzen
                    relayReady = true;
                    
                    // zurückmelden und Callback löschen
                    dmxhost.log && dmxhost.logger( "[i] Relay is ready." );
                    callback && callback( null );
                    callback = null;
                }
                else
                {
                    // Problem beim Öffnen des Geräts?
                    if ( message == 'error:device' )
                    {
                        dmxhost.log && dmxhost.logger( "[!] Relay could not open serial device: " + condenseString(stderrCache) );
                        callback && callback( { code: 'relay:device', message: "Relay could not open serial device.", stderr: stderrCache } );
                    }
                    // unerwartete Nachricht?
                    else
                    {
                        dmxhost.log && dmxhost.logger( "[!] Got unexpected message from relay: '" + message + "'" );
                        callback && callback( { code: 'relay:unknown', message: "Got unexpected message from relay!", relayMessage: message } );
                    }
                    
                    // Relay beenden und "ready"-Nachricht nicht weiter verfolgen
                    readyTimeout && clearTimeout( readyTimeout );
                    dmxhost.quit();
                }
            };
            
            // nach einer Weile prüfen, ob "ready"-Nachricht empfangen wurde
            var readyTimeout = setTimeout(
                function checkRelayReady()
                {
                    // Relay läuft aber die erwartete Antwort kam nicht?
                    if ( relayProcess && !relayReady )
                    {
                        // Fehler melden
                        dmxhost.log && dmxhost.logger( "[!] Relay is not ready in time." );
                        callback && callback( { code: 'relay:readytimeout', message: "Relay is not ready in time." } );
                        
                        // Relay beenden
                        dmxhost.quit();
                    }
                },
                dmxhost.relayResponseTimeout
            );
            
            // reagieren, wenn Relay beendet wird
            relayProcess.on( 'exit', function( code, signal )
            {
                // war Relay schon bereit?
                if ( relayReady )
                {
                    // ja, Fehler zur Laufzeit
                    dmxhost.log && dmxhost.logger( "[!] Relay exited with code/signal/stderr: " + code + "/" + signal + "/'" + condenseString(stderrCache) + "'" );
                    
                    // wenn so eingestellt, nach kurzer Wartezeit neu starten
                    dmxhost.keepAlive && automatedRespawn();
                }
                else
                {
                    // wenn noch nicht als Fehler verarbeitet
                    if ( !relayFailed )
                    {
                        // das ist ein grundlegender Fehler beim erstmaligen Starten!
                        dmxhost.log && dmxhost.logger( "[!] Could not spawn relay: '" + condenseString(stderrCache) + "' (Code " + code + ")" );
                        callback && callback( { code: 'spawn', message: "Could not spawn relay.", errorCode: code, stderr: stderrCache } );
                        relayFailed = true;
                    }
                    
                    // "ready"-Nachricht nicht weiter verfolgen
                    readyTimeout && clearTimeout( readyTimeout );
                }
                
                // Prozessreferenz und Status verwerfen
                relayProcess = null;
                relayReady   = false;
                
                // Callback löschen (weitere Rückmeldungen verhindern)
                callback = null;
            });
            
            // Fehler abfangen
            relayProcess.on( 'error', function( error )
            {
                // war Relay schon bereit?
                if ( relayReady )
                {
                    // ja, Fehler zur Laufzeit (Neustart sollte von exit-Eventhandler erledigt werden)
                    dmxhost.log && dmxhost.logger( "[!] Unexpected runtime error: " + util.inspect(error) );
                }
                else
                {
                    // nein, Fehler beim erstmaligen Starten!
                    dmxhost.log && dmxhost.logger( "[!] Could not spawn relay: " + util.inspect(error) );
                    
                    // Fehler nach oben zurückmelden
                    callback && callback( { code: 'spawn', message: "Could not spawn relay.", error: error } );
                }
                
                // Fehlerstatus setzen
                relayFailed  = true;
                
                // Prozessreferenz und Status verwerfen
                relayProcess = null;
                relayReady   = false;
                
                // Callback löschen (weitere Rückmeldungen verhindern)
                callback = null;
                
                // "ready"-Nachricht nicht weiter verfolgen
                readyTimeout && clearTimeout( readyTimeout );
            });
        }
        
        // Prozess läuft schon
        else
        {
            // protokollieren und fertig
            this.log && this.logger( "[i] Relay already running." );
            callback && callback( null );
        }
    };
    
    
    // Status zurückgeben
    dmxhost.ready = function ready()
    {
        // OK wenn Prozessreferenz intakt, Relay bereit und keine Fehler
        return !!( relayProcess && relayReady && !relayFailed );
    };
    
    
    // Kanaldaten (numerisches Array) senden
    dmxhost.send = function send( options, callback )
    {
        // bereit?
        if ( relayProcess )
        {
            // Array von Daten übergeben?
            if ( options && options.data instanceof Array )
            {
                // Array in Liste von kommaseparierten Werten umwandeln
                var csv = options.data.join(',').trim();
                
                // Daten an Relay schicken
                relayProcess.stdin.write( csv + '\n' );
                
                // auf Antwort von Relay warten
                relayMessageCallback = function waitForOKMessage( message )
                {
                    // Statusmeldung "OK:xxx" zerlegen
                    var status = message.split(':')[0];
                    
                    // OK?
                    if ( status == 'OK' )
                    {
                        // Anzahl übertragener Bytes
                        var sentBytes = parseInt( message.split(':')[1], 10 );
                        
                        // passt Anzahl gesendeter Bytes zu den zu übertragenden Bytes?
                        if ( sentBytes == options.data.length )
                        {
                            // ja, Übertragung war erfolgreich!
                            callback && callback( null, sentBytes );
                        }
                        else
                        {
                            // einige Bytes fehlen oder es gibt ein Synchronisierungsproblem
                            dmxhost.log && dmxhost.logger( "[!] Not all data could be sent: " + sentBytes + "/" + options.data.length );
                            callback && callback( { code: 'send:corrupt', message: "Not all data could be sent.", dataBytes: options.data.length, sentBytes: sentBytes } );
                        }
                    }
                    else
                    {
                        // unbekannte Rückmeldung
                        dmxhost.log && dmxhost.logger( "[!] Unknown response: '" + message + "'" );
                        callback && callback( { code: 'send:unknown', message: "Unknown response.", response: message } );
                    }
                    
                    // fertig, Callbacks löschen
                    relayMessageCallback = null;
                    callback = null;
                    
                    // Timeout löschen
                    responseTimeout && clearTimeout( responseTimeout );
                };
                
                // nach einer Weile prüfen, ob Relay geantwortet hat
                var responseTimeout = setTimeout(
                    function checkRelayResponse()
                    {
                        // Relay läuft aber wartender Handler ist noch registriert?
                        if ( relayProcess && relayMessageCallback )
                        {
                            // Fehler melden
                            dmxhost.log && dmxhost.logger( "[!] Relay did not respond within " + dmxhost.relayResponseTimeout + " ms." );
                            callback && callback( { code: 'relay:responsetimeout', message: "Relay did not respond in time.", timeout: dmxhost.relayResponseTimeout } );
                            
                            // Callback löschen (damit später eintreffende Daten nichts auslösen)
                            relayMessageCallback = null;
                        }
                    },
                    dmxhost.relayResponseTimeout
                );
            }
            else
            {
                // kein Array übergeben, fehlerhafter Aufruf
                this.log && this.logger( "[!] Bad call to send() – data is not an array." );
                callback && callback( { code: 'data', message: "Provided data is not an array." } );
            }
        }
        else
        {
            // das nächste Mal vorher .ready() aufrufen...
            callback && callback( { code: 'unready', message: "Relay is not ready yet." } );
        }
    };
    
    
    // Relay beenden
    dmxhost.quit = function quit( options, callback )
    {
        // Prozess läuft
        if ( relayProcess )
        {
            // Prozess nicht mehr verfolgen
            relayProcess.removeAllListeners();
            
            // Prozess beenden
            relayProcess.kill();
            this.log && this.logger( "[i] Sent signal to terminate relay..." );
            
            // Fehler abfangen
            relayProcess.once( 'error', function( error )
            {
                // Problem beim Senden des SIGTERM-Signals
                dmxhost.log && dmxhost.logger( "[!] Could not kill relay: " + util.inspect(error) );
                
                // Fehler zurückgeben und Callback löschen
                callback && callback( { code: 'kill', message: 'Could not kill relay.', error: error } );
                callback = null;
            });
            
            // warten, bis Prozess beendet
            relayProcess.once( 'exit', function( code, signal )
            {
                // Prozessreferenz und Status verwerfen
                relayProcess = null;
                relayReady   = false;
                
                // fertig
                dmxhost.log && dmxhost.logger( "[i] Relay terminated." );
                callback && callback( null );
                
                // wenn gewünscht, jetzt neu starten
                options && options.respawn && dmxhost.spawn();
            });
        }
        else
        {
            // Prozess läuft nicht mehr, auch kein Problem
            this.log && this.logger( "[i] Relay already terminated." );
            callback && callback( null );
        }
    };
    
    
    
    
    /* :: interne Helfer :: */
    
    
    // automatischen Neustart des Relays planen
    function automatedRespawn()
    {
        setTimeout(
            
            function()
            {
                // .spawn() einfach ohne Callback aufrufen
                dmxhost.spawn();
            },
            
            // Startverzögerung (negative Werte auf Null korrigieren)
            Math.max( dmxhost.keepAliveDelay, 0 )
            
        );
    }
    
    // mehrzeilige Strings in eine protokollfreundliche Zeile umwandeln
    function condenseString( string )
    {
        // trimmen, Zeilenumbrüche durch ' | ' ersetzen, Whitespaces zusammenfassen
        return string.trim().replace( /\s*\n\s*/g, ' | ' ).replace( /\s+/g, ' ' );
    }
    
})();
