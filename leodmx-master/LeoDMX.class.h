/**
 * LeoDMX Class
 * 
 * Software DMX-512 Implementation
 * for Arduino Leonardo & Micro
 * 
 * – uses HardwareSerial for clean UART data transfer
 *   (writes to digital pin 1 and uses Serial1 per default)
 * 
 * – sets a driver enable flag to HIGH during transmit
 *   (uses digital pin 2 per default, can be disabled entirely)
 * 
 * – clean and lightweight, provides a single simple send() method
 * 
 * – synchronous operation only
 *   😊 doesn't clash with your timers!
 *   😊 predictable access of resources and pins!
 *   😕 you can't do other stuff in the meantime
 *     (but nevermind, DMX is fast enough)
 * 
 * Note on models:
 * The idea behind this tool was to use Serial1 for DMX and to have
 * Serial still available for communication over USB. This is a common
 * feature of the Leonardo and Micro models using the ATmega32U4.
 * You can however try any other model by supplying appropriate
 * settings for portDirection, portData and UART.
 * 
 * License: BSD 3-Clause
 * 
 * Nick Schwarzenberg,
 * 09/2014, v0.1.0
 */


// include Arduino environment (DDRD, PORTD, bitWrite() and Serial)
#include <Arduino.h>

// prevent redefinitions
#ifndef LeoDMX_class
#define LeoDMX_class


// class definition
class LeoDMX
{
    private:
    
        // flag config
        bool setEnable;
        
        // relevant bits in Atmega32u4 PORTx register
        char enablePort;
        char txPort;
        
        // pointer to Serial object
        HardwareSerial *UART;
        
        // pointer to registers for port manipulation
        volatile unsigned char *portDirection;
        volatile unsigned char *portData;
        
        // internal methods
        void startFrame();
        void endFrame();
    
    
    public:
    
        LeoDMX(
            
            // set driver enable flag when transmitting?
            bool setEnable=true,
            
            // bit in PORTx for driver enable flag (PORTD bit 1 = digital pin 2)
            unsigned char enablePort=1,
            
            // bit in PORTx for transmit output (PORTD bit 3 = digital pin 1)
            unsigned char txPort=3,
            
            // Serial object for UART output
            HardwareSerial *UART=&Serial1,
            
            // port direction register (input/output selection)
            volatile unsigned char *portDirection=&DDRD,
            
            // port data register (output values)
            volatile unsigned char *portData=&PORTD
            
        ) : setEnable(setEnable), enablePort(enablePort), txPort(txPort), UART(UART), portDirection(portDirection), portData(portData) {};
        
        // send a DMX-512 frame with channel data
        void send( unsigned char channels[], unsigned short length=512 );
        
        // utility: send a null frame with all channels set to zero
        void null( unsigned short length=512 );
};


// see ifndef above
#endif
