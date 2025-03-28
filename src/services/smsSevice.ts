import axios from 'axios';
export const sendSMS = async (contactNumber: string, message: number) => {

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
                    route: 'dlt', // OTP route or any other route as per your requirements
                    sender_id: 'ATTRI', // Optional sender ID
                    message:182308,
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

// export const sendSMS = async (phone: string, message: string) => {
//     const AUTH_KEY = '444198AfHIsDmjkD67d9b1cbP1'; // Keep your actual authkey
//     const TEMPLATE_ID = 'EntertemplateID'; // Replace with your template ID

//     try {
//         const response = await axios.post(
//             'https://control.msg91.com/api/v5/flow',
//             {
//                 template_id: TEMPLATE_ID,
//                 short_url: 0,
//                 recipients: [
//                     {
//                         mobiles: phone,
//                         VAR1: message // Ensure this matches your template variable
//                     }
//                 ]
//             },
//             {
//                 headers: {
//                     authkey: AUTH_KEY,
//                     accept: 'application/json',
//                     'content-type': 'application/json'
//                 }
//             }
//         );

//         // Handle MSG91 API response format
//         if (response.data && response.data.status === 'success') {
//             console.log('SMS sent successfully:', response.data);
//             return response.data;
//         }
        
//         // Handle API-specific error messages
//         const errorMessage = response.data?.message || 
//                             response.data?.error || 
//                             'Unknown error from SMS provider';
//         throw new Error(`SMS API Error: ${errorMessage}`);

//     } catch (error: any) {
//         // Improved error logging
//         const apiError = error.response?.data || error.message;
//         console.error('SMS Service Error:', apiError);
        
//         // More descriptive error message
//         throw new Error(`SMS failed for ${phone}: ${apiError?.message || apiError}`);
//     }
// };