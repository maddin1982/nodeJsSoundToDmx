/**
 * LeoDMX Class
 * Methods
 * 
 * (see header for information)
 */


// LeoDMX header
#include <LeoDMX.class.h>

// macro: coerce a channel index value (unsigned integer)
#define coerceIndex(index) ( (index) > 511 ? 511 : (index) )


/* :: Private Methods :: */

// send DMX bus initialization sequence and activate to UART
void LeoDMX::startFrame()
{
    // set data pin as output
    bitWrite( *this->portDirection, this->txPort, 1 );
    
    // set transmit enable flag
    if ( this->setEnable )
    {
        bitWrite( *this->portDirection, this->enablePort, 1 );
        bitWrite( *this->portData, this->enablePort, 1 );
    }
    
    // “break” period (>= 88 µs low)
    bitWrite( *this->portData, this->txPort, 0 );
    delayMicroseconds(89);
    
    // “mark after break” period (>= 8µs high)
    bitWrite( *this->portData, this->txPort, 1 );
    delayMicroseconds(9);
    
    // switch to UART output
    // (250 kbit/s, no parity, 8 data bits, 2 stop bits)
    this->UART->begin( 250000, SERIAL_8N2 );
    
    // send start null byte
    this->UART->write( 0x0 );
}

// reset DMX bus to idle state
void LeoDMX::endFrame()
{
    // end UART mode
    this->UART->end();
    
    // bus idle state is high
    bitWrite( *this->portData, this->txPort, 1 );
    
    // reset transmit enable flag
    if ( this->setEnable )
    {
        bitWrite( *this->portData, this->enablePort, 0 );
    }
}


/* :: Public Methods :: */

// send a DMX-512 frame with channel data
void LeoDMX::send( unsigned char channels[], unsigned short length/*=512*/ )
{
    // coerce length
    length = coerceIndex( length );
    
    // send initialization sequence and activate UART
    this->startFrame();
    
    // send all channel values
    this->UART->write( channels, length );
    
    // wait until all bytes are sent
    this->UART->flush();
    
    // deactivate UART and set bus to idle state
    this->endFrame();
}

// send a null frame with all channels set to zero
void LeoDMX::null( unsigned short length/*=512*/ )
{
    // array of zeroes
    static unsigned char zeroes[512] = {0};
    
    // coerce length
    length = coerceIndex( length );
    
    // send frame
    this->send( zeroes, length );
}
