import { Ionicons } from '@expo/vector-icons';

// Canonical interest categories — shared by onboarding (auth/customize) and the
// profile editor so the two never drift. ids are what we persist on User.interests.
export interface InterestCard {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const INTERESTS: InterestCard[] = [
  { id: 'hiking', name: 'Hiking', icon: 'trail-sign-outline' },
  { id: 'camping', name: 'Camping', icon: 'bonfire-outline' },
  { id: 'fishing', name: 'Fishing', icon: 'water-outline' },
  { id: 'kayaking', name: 'Kayaking', icon: 'boat-outline' },
  { id: 'birdwatching', name: 'Bird Watching', icon: 'eye-outline' },
  { id: 'photography', name: 'Photography', icon: 'camera-outline' },
  { id: 'cycling', name: 'Cycling', icon: 'bicycle-outline' },
  { id: 'picnicking', name: 'Picnicking', icon: 'pizza-outline' },
  { id: 'swimming', name: 'Swimming', icon: 'umbrella-outline' },
];
