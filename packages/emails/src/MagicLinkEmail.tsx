import {
    Body,
    Button,
    Container,
    Head,
    Html,
    Preview,
    Section,
    Text
} from '@react-email/components';
import * as React from 'react';

interface MagicLinkEmailProps {
    url: string;
}

export const MagicLinkEmail = ({ url }: MagicLinkEmailProps) => (
    <Html>
        <Head />
        <Preview>Log in with this magic link</Preview>
        <Body style={main}>
            <Container style={container}>
                <Text style={h1}>Login</Text>
                <Text style={text}>Please click the button below to log in to your account.</Text>
                <Section style={{ textAlign: 'center' }}>
                    <Button style={button} href={url}>
                        Log in
                    </Button>
                </Section>
                <Text style={text}>
                    If you didn’t request this, you can safely ignore this email.
                </Text>
            </Container>
        </Body>
    </Html>
);

export default MagicLinkEmail;

const main = {
    backgroundColor: '#f6f9fc',
    padding: '10px 0'
};

const container = {
    backgroundColor: '#ffffff',
    border: '1px solid #f0f0f0',
    padding: '45px'
};

const h1 = {
    color: '#333',
    fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '40px 0',
    padding: '0'
};

const text = {
    color: '#333',
    fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
    fontSize: '14px',
    margin: '24px 0'
};

const button = {
    backgroundColor: '#000',
    borderRadius: '5px',
    color: '#fff',
    fontFamily: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",
    fontSize: '15px',
    fontWeight: 'bold',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'inline-block',
    width: '210px',
    padding: '14px 7px'
};
