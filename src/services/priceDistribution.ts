import User from "../models/user.model";


export const distributeCommissions = async (
    user: any,
    productPrice: number
  ): Promise<void> => {
    try {
      // Define percentage distribution for each generation
      const generationPercentages = [11, 9, 7, 5, 3, 2, 1]; // Percentages for 1st to 7th generations
  
      let currentUser = user;
      let generation = 0;
  
      while (currentUser?.referral_by?.length > 0 && generation < generationPercentages.length) {
        // Move to the next generation
        currentUser = currentUser.referral_by[0];
  
        // Calculate the commission for the current generation
        const percentage = generationPercentages[generation];
        const commission = (percentage / 100) * productPrice;
  
        // Update user with commission history
        await User.findByIdAndUpdate(currentUser._id, {
          $inc: { balance: commission },
          $push: {
            commissionHistory: {
              amount: commission,
              level: generation + 1,
              fromUser: user._id
            }
          }
        });
  
        // console.log(
        //   `Generation ${generation + 1}: ${currentUser.username} earned ${commission}`
        // );
  
        // Increment generation
        generation++;
      }
    } catch (error) {
      console.error("Error distributing commissions:", error);
      throw error;
    }
  };