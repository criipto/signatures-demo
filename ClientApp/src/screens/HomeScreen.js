import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ButtonGroup, Button, Input, Container, Row, Col} from 'reactstrap';
import jwtDecode from 'jwt-decode';
import samplePdf from '../assets/sample.pdf';

import logo_dknemid from '../assets/logo-e-id-dk-nemid.svg';
import logo_nobankid from '../assets/logo-e-id-no-bankid.svg';
import logo_sebankid from '../assets/logo-e-id-se-bankid.svg';

import './HomeScreen.css';

const toBase64 = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = error => reject(error);
});

const PROVIDERS = [
  {
    key: 'dknemid',
    logo: logo_dknemid,
    languages: ['da', 'en'],
    acr_values: ['urn:grn:authn:dk:nemid:poces', 'urn:grn:authn:dk:nemid:moces', 'urn:grn:authn:dk:nemid:moces:codefile']
  },
  {
    key: 'nobankid',
    logo: logo_nobankid,
    pdf: true,
    languages: ['nb', 'en'],
    acr_values: ['urn:grn:authn:no:bankid']
  },
  {
    key: 'sebankid',
    logo: logo_sebankid,
    languages: ['sv', 'en'],
    acr_values: ['urn:grn:authn:se:bankid:same-device', 'urn:grn:authn:se:bankid:another-device']
  }
]

export default function HomeScreen() {
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [provider, setProvider] = useState(PROVIDERS.find(search => search.key === 'nobankid'));
  const [signature, setSignature] = useState(null);
  const [language, setLanguage] = useState(provider.languages[0]);
  const [acrValue, setAcrValue] = useState(provider.acr_values[0]);

  const handleProvider = (provider) => {
    setProvider(provider);
    setLanguage(provider.languages[0]);
    setAcrValue(provider.acr_values[0]);
    if (!provider.pdf) setMode('text');    
  }

  const handleSubmit = async () => {
    setSignature(null);

    const url = mode === 'text' ? '/sign/text' : '/sign/pdf';
    const data = mode === 'text' ? {
      text,
      language,
      acr_value: acrValue
    } : {
      pdf: (await toBase64(file)).replace('data:application/pdf;base64,', ''),
      language,
      acr_value: acrValue
    };

    axios.post(url, data).then(response => {
      window.open(response.data.redirectUri, '_blank');
    }).catch(console.log.bind(console));
  };

  const messageListener = useCallback(event => {
    if (event.data.startsWith('SIGN_TOKEN_RESPONSE:')) {
      const signature = event.data.replace('SIGN_TOKEN_RESPONSE:', '');
      setSignature(JSON.parse(window.atob(signature)));
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', messageListener);
    return () => window.removeEventListener('message', messageListener);
  }, []);

  return (
    <Container className="home-screen">
      <Row>
        {PROVIDERS.map(item => (
          <Col key={item.key}>
            <img className={"provider-button" + (item === provider ? ' active' : '')} src={item.logo} onClick={() => handleProvider(item)} />
          </Col>
        ))}
      </Row>
      <Row>
        <Col>
          <ButtonGroup>
            <Button color={mode === 'text' ? 'primary' : 'secondary'} onClick={() => setMode('text')}>Sign text</Button>
            {provider.pdf && (<Button color={mode === 'pdf' ? 'primary' : 'secondary'} onClick={() => setMode('pdf')}>Sign pdf</Button>)}
          </ButtonGroup>
        </Col>
        <Col>
          <select className="form-control" value={language} onChange={(event) => setLanguage(event.target.value)}>
            {provider.languages.map(language => (
              <option value={language}>{language}</option>
            ))}
          </select>
        </Col>
        <Col>
          <select className="form-control" value={acrValue} onChange={(event) => setAcrValue(event.target.value)}>
            {provider.acr_values.map(value => (
              <option value={value}>{value}</option>
            ))}
          </select>
        </Col>
      </Row>
      <Row>
        <Col>
          {mode === 'text' ? (
            <Input type="textarea" placeholder="Enter text to sign ..." value={text} onChange={(event) => setText(event.target.value)} />
          ) : (
            <div>
              <input type="file" onChange={(event) => setFile(event.target.files[0])} />
              <a href={samplePdf}>Download sample</a>
            </div>
          )}
        </Col>
      </Row>
      <Row>
        <Col>
          <div className="float-right">
            (Allow popups) <Button color="primary" onClick={handleSubmit}>Sign now</Button>
          </div>
        </Col>
      </Row>
      {signature && (
        <Row>
          <Col><Input type="textarea" value={JSON.stringify(signature, null, 2)} style={{height: '500px'}} /></Col>
          {mode === 'pdf' && (<Col><iframe style={{border: 0, height: '500px', width: '100%'}} src={`data:application/pdf;base64,${signature.evidence[0].padesSignedPdf}`}></iframe></Col>)}
        </Row>
      )}
    </Container>
  );
}
