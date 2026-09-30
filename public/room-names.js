// Suggested room names: an adjective and a noun, like prickly-pear or worried-hamster.
// Words are short, friendly, easy to spell and easy to picture, so a name is simple to
// remember and to read out to the room.

const ADJECTIVES = [
  'amber', 'ancient', 'angry', 'bashful', 'bold', 'bouncy', 'brave', 'breezy', 'bright', 'brisk',
  'bubbly', 'bumpy', 'busy', 'calm', 'cheeky', 'cheerful', 'chilly', 'chubby', 'clever', 'cloudy',
  'clumsy', 'cosmic', 'cozy', 'crafty', 'cranky', 'crispy', 'crunchy', 'curious', 'curly', 'dainty',
  'daring', 'dizzy', 'dreamy', 'dusty', 'eager', 'electric', 'fancy', 'fearless', 'feisty', 'fierce',
  'fluffy', 'fizzy', 'frosty', 'fuzzy', 'gentle', 'giant', 'giddy', 'gleaming', 'glowing', 'golden',
  'goofy', 'grumpy', 'happy', 'hasty', 'hidden', 'hungry', 'icy', 'jazzy', 'jolly', 'jumpy',
  'lazy', 'lively', 'lonely', 'loud', 'lucky', 'magic', 'mellow', 'merry', 'mighty', 'misty',
  'modest', 'moody', 'nervous', 'nimble', 'noble', 'odd', 'plucky', 'polite', 'prickly', 'proud',
  'puffy', 'purple', 'quick', 'quiet', 'quirky', 'rapid', 'rowdy', 'royal', 'rusty', 'salty',
  'sassy', 'secret', 'shiny', 'shy', 'silent', 'silly', 'silver', 'sleepy', 'slippery', 'sly',
  'smooth', 'sneaky', 'snowy', 'soggy', 'sparkly', 'speedy', 'spicy', 'spiky', 'spooky', 'sticky',
  'stormy', 'sturdy', 'sunny', 'swift', 'tangy', 'tiny', 'toasty', 'wacky', 'wandering',
  'wiggly', 'windy', 'wise', 'witty', 'wobbly', 'worried', 'zany', 'zesty'
];

const NOUNS = [
  'acorn', 'alpaca', 'apple', 'avocado', 'badger', 'bagel', 'banana', 'beaver', 'biscuit', 'bison',
  'blossom', 'bubble', 'buffalo', 'bunny', 'cactus', 'camel', 'canoe', 'carrot', 'castle', 'cheetah',
  'cherry', 'chipmunk', 'cobra', 'coconut', 'comet', 'cookie', 'cougar', 'coyote', 'crayon', 'cricket',
  'crow', 'cupcake', 'dolphin', 'donut', 'dragon', 'duckling', 'eagle', 'falcon', 'ferret', 'flamingo',
  'fox', 'gecko', 'giraffe', 'goose', 'gopher', 'hamster', 'hedgehog', 'heron', 'hippo', 'iguana',
  'jaguar', 'jellybean', 'kangaroo', 'kettle', 'kitten', 'koala', 'lantern', 'lemon', 'lemur', 'lion',
  'llama', 'lobster', 'mango', 'meadow', 'meerkat', 'moose', 'muffin', 'narwhal', 'noodle', 'octopus',
  'otter', 'owl', 'panda', 'pancake', 'parrot', 'peach', 'peacock', 'peanut', 'pear', 'pebble',
  'pelican', 'penguin', 'pepper', 'pickle', 'pigeon', 'pinecone', 'pirate', 'pizza', 'platypus', 'pony',
  'popcorn', 'possum', 'potato', 'pretzel', 'pudding', 'puffin', 'pumpkin', 'puppy', 'raccoon', 'radish',
  'raven', 'rhino', 'robin', 'rocket', 'salmon', 'seal', 'shark', 'sloth', 'snail', 'sparrow',
  'squid', 'squirrel', 'teapot', 'tiger', 'toad', 'toucan', 'turnip', 'turtle', 'unicorn', 'volcano',
  'waffle', 'walrus', 'weasel', 'whale', 'wizard', 'wombat', 'yak', 'zebra'
];

const pick = list => list[Math.floor(Math.random() * list.length)];

export function suggestRoomName() {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}
