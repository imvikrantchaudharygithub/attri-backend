import axios from 'axios';
export const sendSMS = async (contactNumber: string, message: string) => {
    const API_KEY = '1Cvkoh6iClZqNhWwA14gJ3bytqAzWQXh8OFm2ANCmh4XJRePMkpkvnsKjop0';

    if (!API_KEY) {
        throw new Error('Blank Fast2SMS API Key');
    }

    try {
        const response = await axios.post(
            'https://www.fast2sms.com/dev/bulkV2',
            {},
            {
                params: {
                    // authorization: API_KEY,
                    route: 'otp', // OTP route or any other route as per your requirements
                    // sender_id: 'FSTSMS', // Optional sender ID
                    // message:message,
                    // language: "english",
                    variables_values : `${message}`,
                    numbers: contactNumber,
                    // flash: '0'
                },
                headers: {
                    'authorization': API_KEY,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        if (response.data.return) {
            console.log('SMS sent successfully:', response.data );
            return response.data;
        } else {
            throw new Error(`Failed to send SMS: ${response.data.message}, mes-${message} , phone-${contactNumber}`);
        }
    } catch (error: any) {
        console.error('Error sending SMS:', error.data || error);
        throw new Error(`Failed to send SMS: ${error}`);
    }
};