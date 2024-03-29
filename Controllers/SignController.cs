﻿using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json;

namespace signing_with_aspnet_core3.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class SignController : Controller
    {
        private readonly ILogger<SignController> _logger;
        private readonly IConfiguration _configuration;
        private readonly IHttpClientFactory _clientFactory;

        public SignController(ILogger<SignController> logger, IConfiguration configuration, IHttpClientFactory clientFactory)
        {
            _logger = logger;
            _configuration = configuration;
            _clientFactory = clientFactory;

        }

        public static string Base64Encode(string plainText, string encoding) {
            var plainTextBytes = System.Text.Encoding.GetEncoding(encoding).GetBytes(plainText);
            return System.Convert.ToBase64String(plainTextBytes);
        }

        public class SignProperties {
            public string orderName {get; set;}
            public bool showConfirmation {get; set;}
            public bool showUnderstanding {get; set;}
        }
        public class PdfDocumentInput {
            public string pdf {get; set;}
            public PdfSeal seal {get; set;} = new PdfSeal {
                x = 40,
                y = 660,
                page = 1
            };
        }

        public class PdfSeal {
            public Int64 x {get; set;}
            public Int64 y {get; set;}
            public Int64 page {get; set;}
        }

        public class PdfSignInput {
            public string acr_value {get; set;} = "urn:grn:authn:no:bankid";
            public string pdf {get; set;}
            public string language {get; set;} = "en";

            public SignProperties signProperties {get; set;} = new SignProperties {
                orderName = "Demo signing"
            };

            public List<PdfDocumentInput> documents {get; set;}
        }
        public class PdfSignRequest {
            public class PdfDocument {
                
                public string description {get; set;}
                public string pdf {get; set;}
                public PdfSeal seal {get; set;}
            }

            public SignProperties signProperties {get; set;}
            public List<PdfDocument> documents {get; set;}

        }
        public class TextSignInput {
            public SignProperties signProperties {get; set;} = new SignProperties {
                orderName = "Demo signing"
            };
            public string acr_value {get; set;} = "urn:grn:authn:no:bankid";
            public string text {get; set;}
            public string language {get; set;} = "en";
        }
        public class TextSignRequest {
            public string signtext {get; set;}
            public string orderName {get; set;}
            public string showUnderstanding {get; set;}
            public string showConfirmation {get; set;}
        }

        public class SignResponse {
            public string redirectUri {get; set; }

            public Dictionary<string,string> body {get; set;}
        }

        [HttpPost("pdf")]
        public async Task<JsonResult> Pdf(PdfSignInput input)
        {
            var body = new PdfSignRequest{
                signProperties = new SignProperties{
                    orderName = "Demo signing"
                },
                documents = input.documents.Select(document => new PdfSignRequest.PdfDocument{
                    description = "Demo document",
                    pdf = document.pdf,
                    seal = document.seal
                }).ToList()
            };
            var jsonBody = new StringContent(
                JsonConvert.SerializeObject(body),
                Encoding.UTF8,
                "application/json");

            var client = _clientFactory.CreateClient("criipto-http-client");
            string baseUrl = $"https://{_configuration["CriiptoVerify:DnsName"]}/sign/pdfv1/";
            var query = new Dictionary<string, string>()
            {
                { "wa", "wsignin1.0" },
                { "wtrealm",  _configuration["CriiptoVerify:ClientId"] },
                { "wreply", $"{this.Request.Scheme}://{this.Request.Host}/sign/callback" },
                { "wauth", input.acr_value },
                { "ui_locales", input.language }
            };

            var url = new Uri(QueryHelpers.AddQueryString(baseUrl, query));

            using var httpResponse = await client.PostAsync(
                url,
                jsonBody
            );

            if (httpResponse.IsSuccessStatusCode) {
                var jsonString = await httpResponse.Content.ReadAsStringAsync();
                return Json(JsonConvert.DeserializeObject<SignResponse>(jsonString));
            } 
            else {
                HttpContext.Response.StatusCode = (int)httpResponse.StatusCode;
                var error = await httpResponse.Content.ReadAsStringAsync();
                return Json(new {error = error});
            }
        }

        [HttpPost("text")]
        public SignResponse Text(TextSignInput request)
        {
            string baseUrl = $"https://{_configuration["CriiptoVerify:DnsName"]}/sign/text";
            string text = request.text;
            string encoding = request.acr_value.StartsWith("urn:grn:authn:no") ? "ISO-8859-1" : "UTF-8";
            string encodedText = Base64Encode(text, encoding);
            
            var query = new Dictionary<string, string>()
            {
                { "wa", "wsignin1.0" },
                { "wtrealm",  _configuration["CriiptoVerify:ClientId"] },
                { "wreply", $"{this.Request.Scheme}://{this.Request.Host}/sign/callback" },
                { "wauth", request.acr_value },
                { "ui_locales", request.language },
                { "signtext", encodedText },
                { "orderName", request.signProperties.orderName },
                { "showUnderstanding", request.signProperties.showUnderstanding.ToString().ToLower() },
                { "showConfirmation", request.signProperties.showConfirmation.ToString().ToLower() }
            };

            if (encodedText.Length < 500) {
                var url = new Uri(QueryHelpers.AddQueryString(baseUrl, query));

                return new SignResponse {
                    redirectUri = url.AbsoluteUri
                };
            } else {
                var url = new Uri(baseUrl);

                return new SignResponse {
                    redirectUri = url.AbsoluteUri,
                    body = query
                };
            }
        }

        public class CallbackResponse {
            public string signature {get; set; }
        }
        [HttpPost("callback")]
        [Consumes("application/x-www-form-urlencoded")]
        [DisableRequestSizeLimit]
        [RequestFormLimits(ValueLengthLimit = 20971520)]
        public async Task<IActionResult> Callback([FromForm] CallbackResponse response)
        {
            var client = _clientFactory.CreateClient();
            string authority = $"https://{_configuration["CriiptoVerify:DnsName"]}/.well-known/openid-configuration";
            var oidcMgr = new ConfigurationManager<OpenIdConnectConfiguration>(
                authority,
                new OpenIdConnectConfigurationRetriever(),
                client
            );

            var discoveryDoc = await oidcMgr.GetConfigurationAsync();
            var validationParams = new TokenValidationParameters{
                ValidIssuer = discoveryDoc.Issuer,
                ValidAudience = _configuration["CriiptoVerify:ClientId"],
                IssuerSigningKeys = discoveryDoc.SigningKeys,
                
            };

            var tokenHandler = new JwtSecurityTokenHandler{
                InboundClaimTypeMap = new Dictionary<string, string>(),
                MaximumTokenSizeInBytes = int.MaxValue
            };

            var regexTimeLimit = TimeSpan.Parse(_configuration["CriiptoVerify:JwtRegexTimeout"]);
            var jwtPattern = System.IdentityModel.Tokens.Jwt.JwtConstants.JsonCompactSerializationRegex;
            // JWT variant of
            //  https://stackoverflow.com/questions/1732348/regex-match-open-tags-except-xhtml-self-contained-tags/1732454#1732454
            // forces this when your CPU is not fast enough given the size of
            // document you need to sign:
            Microsoft.IdentityModel.JsonWebTokens.JwtTokenUtilities.RegexJws =
                new Regex(
                    jwtPattern,
                    RegexOptions.Compiled | RegexOptions.CultureInvariant,
                    regexTimeLimit
                );
            SecurityToken validatedToken = null;
            var claimsPrincipal = tokenHandler.ValidateToken(response.signature, validationParams, out validatedToken);
            var jwtToken = validatedToken as JwtSecurityToken;

            if (jwtToken != null) {
                ViewData["payload"] = jwtToken.RawPayload;
            }

            return View();
        }
    }

}
