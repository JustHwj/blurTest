require('dotenv').config();
import { gotScraping } from 'got-scraping';
// const blurAbi = fs.readFileSync(path.join(__dirname, '../abis/Blur.json')).toString();
// const blurProxyAbi = fs.readFileSync(path.join(__dirname, '../abis/BlurProxy.json')).toString();
const privatekey = process.env.PRIVATE_KEY_HEX
const wallet = new ethers.Wallet(privatekey!);
console.log(wallet.address)
export const decode = (input :any) => {
    const key = "XTtnJ44LDXvZ1MSjdyK4pPT8kg5meJtHF44RdRBGrsaxS6MtG19ekKBxiXgp";
    const bytes = Buffer.from(input, "base64").toString("utf-8");
    let result = "";
    for (let i = 0; i < bytes.length; i++) {
        result += String.fromCharCode(bytes.charCodeAt(i) ^ key.charCodeAt(i % key.length))
    }
    return result;
}

// export const parseCalldata = (calldata:any) => {
//     const iface = new ethers.Interface(blurAbi);
//     const parsedData = iface.parseTransaction({ data: calldata });
//     let args = parsedData.args;
//     if (parsedData.name == "execute") {
//         args = [[args]];
//     }
//     const blurProxyIface = new ethers.Interface(blurProxyAbi);
//     return blurProxyIface.encodeFunctionData("buyAssetsForEth", args);
// }

export const getAuthToken = async () => {
    const fileName = "blur_token.txt";
    if (fs.existsSync(fileName)) {
        const fileContent = fs.readFileSync(fileName).toString();
        if (fileContent || fileContent.length > 0) {
            const storage = JSON.parse(fileContent);
            if (Date.now() - storage.timestamp < 24 * 60 * 60 * 1000) {
                return storage.authToken;
            }
        }
    }



    const challengeResponse = await gotScraping({
        url: `https://core-api.prod.blur.io/auth/challenge`,
        body: JSON.stringify(
            {
                walletAddress: wallet.address
            }
        ),
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
    });

    if (challengeResponse.statusCode != 201) {
        console.error(`Blur challenge error, ${challengeResponse.body}`);
        return "";
    }
    const challengeObject = JSON.parse(challengeResponse.body);
    const signature = await wallet.signMessage(challengeObject.message);
    challengeObject["signature"] = signature;
    const loginResponse = await gotScraping({
        url: `https://core-api.prod.blur.io/auth/login`,
        body: JSON.stringify(challengeObject),
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
    });
    if (loginResponse.statusCode != 201) {
        console.error(`Blur login error, ${loginResponse.body}`);
        return "";
    }
    const loginObject = JSON.parse(loginResponse.body);
    fs.writeFileSync(fileName, JSON.stringify({
        timestamp: Date.now(),
        authToken: loginObject.accessToken
    }));
    return loginObject.accessToken;
}

export const getCalldata = async (tokenPrices : any, contractAddress : any, userAddress : any , blurAuthToken : any ) => {
  
        const response = await gotScraping({
            url: `https://core-api.prod.blur.io/v1/buy/${contractAddress}`,
            body: JSON.stringify({
                tokenPrices: tokenPrices,
                userAddress: userAddress
            }),
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'cookie': `authToken=${blurAuthToken}; walletAddress=${userAddress}`,
            },
        });
        //console.log(response);
        if (response.statusCode != 201) {


            console.log(`Get blur calldata failed, tokens:${JSON.stringify(tokenPrices)}, response: ${response}`);
            return response;
        }
        const responseBody = JSON.parse(response.body);
        if (!responseBody.success) {
            console.log(`Get blur calldata failed, tokens:${JSON.stringify(tokenPrices)}, response: ${response}`);

            return response;
        }
        const blurResult = JSON.parse(decode(responseBody.data));
        if (blurResult.cancelReasons && blurResult.cancelReasons.length > 0) {

            return response;
        }
        //console.log(blurResult);
        const blurTxnData = blurResult.buys[0].txnData.data;
        return blurTxnData;

}

export const getTokendata = async (collectionName: string, type: string, values: string[], userAddress: string, blurAuthToken: string) => {
    const filters = new URLSearchParams({
        traits: JSON.stringify([{ type, values }]), // 将数组转换为 JSON 字符串
        hasAsks: 'true' // 将布尔值转换为字符串
    });

    try {
        const response = await gotScraping({
            url: `https://core-api.prod.blur.io/v1/collections/${collectionName}/tokens`,
            searchParams: filters,
            method: 'get',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'cookie': `authToken=${blurAuthToken}; walletAddress=${userAddress}`,
            },
        });

        const responseBody = JSON.parse(response.body);
        return responseBody;
    } catch (error) {
        console.error('Error:', error);
        throw error; // 抛出错误以便调用者能够捕获并进一步处理
    }
}

export const wsConnect = async (address : any , auth : any) => {

    const generateRandomId = (): string => {
        const E: string = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        return Array.from({ length: 12 }, (): string => {
            const eo: number = Math.floor(Math.random() * E.length);
            return E[eo];
        }).join("");
    };
    const WebSocket = require('ws');

    // URL
    const baseUrl = 'wss://feeds.prod.blur.io/socket.io/';
    const queryParams = {
        tabId: generateRandomId(),
        storageId: generateRandomId(),
        EIO: '4',
        transport: 'websocket'
    };

// 创建 URLSearchParams 对象并添加查询参数
    const searchParams = new URLSearchParams(queryParams);

    // 创建完整的 URL
    const url = `${baseUrl}?${searchParams.toString()}`;

    // 建立 WebSocket 连接
    const ws = new WebSocket(url);

    ws.on('open', function open() {
        console.log('WebSocket connected!');

        // 在连接打开时发送消息
        //ws.send('40');
        
    });

    ws.on('message', async function incoming(data :any) {
        // 将 Buffer 数据转换为字符串
        const message = data.toString();
        console.log('Received message:', message);

        if (message.startsWith('0')) {
            // 如果收到的消息是初始连接消息，则发送 40
            ws.send('40');
            console.log('Sent message:', '40');
        } else if (message.startsWith('40')) {
            // 如果收到的消息是连接成功消息，则发送订阅信息
            ws.send(`4219["subscribe",["${address}.feeds.activity.eventsCreated"]]`);
            console.log('Sent subscription message');
        } else if (message === '2') {
            // 如果收到的消息是 '2'，则发送 '3'
            ws.send('3');
            console.log('Sent message:', '3');
        } else {
            try {
                // 手动解析消息内容
                const startIndex = message.indexOf('["');
                if (startIndex !== -1) {

                        const [eventType, eventData] = JSON.parse(message.substring(startIndex));
                        console.log('Event type:', eventType);
                        console.log('Event data:', eventData);
                        //console.log('Subscription info:', subscriptionInfo);
                         if (eventType.endsWith('.feeds.activity.eventsCreated')) {
                            eventData.items.forEach(async (item : any) => {
                                if (item.eventType === 'ORDER_CREATED') {
                                    const { priceUnit, marketplace, createdAt, tokenId, price } = item;
                                    console.log('Order created:');
                                    console.log('Price Unit:', priceUnit);
                                    console.log('Marketplace:', marketplace);
                                    console.log('Created At:', createdAt);
                                    console.log('Token ID:', tokenId);
                                    console.log('Price:', price);
                                    if(price < 0.55){
                                        const tokenPrices = eventData.items.map((item : any) => ({
                                            price: {
                                                unit: item.priceUnit,
                                                amount: String(item.price), 
                                                listedAt: item.createdAt
                                            },
                                            tokenId: item.tokenId,
                                            isSuspicious: false
                                        }));

                                        const calldata = await getCalldata(tokenPrices, address, wallet.address, auth);
                                        console.log('calldata:',calldata)
                                    }
                                }
                            });
                        }
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        }
    });


    ws.on('close', function close() {
        console.log('WebSocket connection closed');
    });

    ws.on('error', function error(err) {
        console.error('WebSocket encountered error: ', err);
    });


}
async function main() {
    try {
        //await register();
        const auth = await getAuthToken();
        const address = '0xbabafdd8045740449a42b788a26e9b3a32f88ac1';
        await wsConnect(address,auth);
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

main();
