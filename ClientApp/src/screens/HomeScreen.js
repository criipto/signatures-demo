import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { ButtonGroup, Button, FormGroup, Label, Input, Container, Row, Col} from 'reactstrap';
import samplePdf from '../assets/sample.pdf';

import logo_dknemid from '../assets/logo-e-id-dk-nemid.svg';
import logo_nobankid from '../assets/logo-e-id-no-bankid.svg';
import logo_sebankid from '../assets/logo-e-id-se-bankid.svg';

import './HomeScreen.css';

import pdfjs from 'pdfjs-dist/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const toBase64 = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = error => reject(error);
});

const toArrayBuffer = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsArrayBuffer(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = error => reject(error);
});

function base64ToBlob( base64, type = "application/pdf" ) {
  const binStr = atob( base64 );
  const len = binStr.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[ i ] = binStr.charCodeAt( i );
  }
  return new Blob( [ arr ], { type: type } );
}

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
    acr_values: ['urn:grn:authn:se:bankid:same-device', 'urn:grn:authn:se:bankid:another-device', 'urn:grn:authn:se:bankid:another-device:qr']
  }
]

export default function HomeScreen() {
  const formRef = useRef();
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [documents, setDocuments] = useState([]);
  const [response, setResponse] = useState(null);
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

  const handleClear = () => {
    setText('');
    setDocuments([]);
    setSignature(null);
  };

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files);
    event.target.value = '';

    const documents = await Promise.all(files.map(async (file) => {
      const doc = await pdfjs.getDocument(await toArrayBuffer(file)).promise;
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });

      return {
        seal: {
          page: 1,
          x: 40,
          y: Math.round(viewport.height - 40 - 50)
        },
        file
      }
    }));
    setDocuments((old) => old.concat(documents));
  };

  const handleSeal = (document, key, value) => {
    value = Math.round(value);

    setDocuments(documents => {
      return documents.map(search => {
        if (search !== document) return search;

        return {
          ...search,
          seal: {
            ...search.seal,
            [key]: value
          }
        }
      });
    });
  };

  const handleSubmit = async () => {
    setSignature(null);
    setResponse(null);

    let documentInput;
    if (mode === 'pdf') {
      documentInput = await Promise.all(documents.map(async (document) => {
        return {
          seal: document.seal,
          pdf: (await toBase64(document.file)).replace('data:application/pdf;base64,', ''),
        }
      }));
    }

    const url = mode === 'text' ? '/sign/text' : '/sign/pdf';
    const data = mode === 'text' ? {
      text,
      language,
      acr_value: acrValue
    } : {
      documents: documentInput,
      language,
      acr_value: acrValue
    };

    axios.post(url, data).then(response => {
      if (response.data.body) {
        setResponse(response.data);
      } else {
        window.open(response.data.redirectUri, '_blank');
      }
    }).catch(console.log.bind(console));
  };

  const messageListener = useCallback(event => {
    if (event.data && typeof event.data === "string" && event.data.startsWith('SIGN_TOKEN_RESPONSE:')) {
      const signature = event.data.replace('SIGN_TOKEN_RESPONSE:', '');
      setResponse(null);
      setSignature(JSON.parse(window.atob(signature)));
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', messageListener);
    return () => window.removeEventListener('message', messageListener);
  }, [messageListener]);

  useEffect(() => {
    if (!response) return;

    formRef.current.submit();
  }, [response]);

  return (
    <Container className="home-screen">
      <Row>
        {PROVIDERS.map(item => (
          <Col key={item.key}>
            <img className={"provider-button" + (item === provider ? ' active' : '')} src={item.logo} alt={item.key} onClick={() => handleProvider(item)} />
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
              <option key={language} value={language}>{language}</option>
            ))}
          </select>
        </Col>
        <Col>
          <select className="form-control" value={acrValue} onChange={(event) => setAcrValue(event.target.value)}>
            {provider.acr_values.map(value => (
              <option key={value} value={value}>{value}</option>
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
              {documents.length ? (
                <div className="float-right">
                  <Button color="default" onClick={handleClear}>Clear</Button>
                </div>
              ) : null}
              <input type="file" onChange={handleFiles} multiple />
              <a href={samplePdf}>Download sample</a>

              {documents.length ? (
                <Row className="files-input-list">
                  {documents.map((document, index) => (
                    <Col key={index} md={4}>
                      <strong>{document.file.name}</strong>

                      <Row form>
                        <Col>
                          <FormGroup>
                            <Label>Seal page</Label>
                            <Input type="number" value={document.seal.page} onChange={(event) => handleSeal(document, 'page', event.target.value)} />
                          </FormGroup>
                        </Col>
                        <Col>
                          <FormGroup>
                            <Label>Seal x</Label>
                            <Input type="number" value={document.seal.x} onChange={(event) => handleSeal(document, 'x', event.target.value)} />
                          </FormGroup>
                        </Col>
                        <Col>
                          <FormGroup>
                            <Label>Seal y</Label>
                            <Input type="number" value={document.seal.y} onChange={(event) => handleSeal(document, 'y', event.target.value)} />
                          </FormGroup>
                        </Col>
                      </Row>
                    </Col>
                  ))}
                </Row>
              ) : null}
            </div>
          )}
        </Col>
      </Row>
      <Row>
        <Col>
          <Button color="default" onClick={handleClear}>Clear</Button>
          <div className="float-right">
            (Allow popups) <Button color="primary" onClick={handleSubmit}>Sign now</Button>
          </div>
        </Col>
      </Row>
      {signature && (
        <Row>
          <Col><Input type="textarea" readOnly value={JSON.stringify(signature, null, 2)} style={{height: `${(Array.isArray(signature.evidence) ? signature.evidence.length : 1) * 500}px`}} /></Col>
          {mode === 'pdf' && (
            <Col>
              {signature.evidence.map((evidence, index) => (
                <iframe
                  key={index}
                  style={{border: 0, height: '500px', width: '100%'}}
                  src={URL.createObjectURL(base64ToBlob(evidence.padesSignedPdf))}
                  title={`PDF result ${index + 1}`}
                />
              ))}
            </Col>
          )}
        </Row>
      )}
      <form target="_blank" method="POST" action={response && response.redirectUri} ref={formRef}>
        {response && response.body && Object.keys(response.body).map(key => (
          <input key={key} type="hidden" name={key} value={response.body[key]} />
        ))}
      </form>
    </Container>
  );
}
